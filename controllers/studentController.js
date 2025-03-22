import StudentProfile from "../models/StudentProfile.js"
import Complaint from "../models/Complaint.js"
import Poll from "../models/Poll.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import RoomAllocation from "../models/RoomAllocation.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import LostAndFound from "../models/LostAndFound.js"
import mongoose from "mongoose"
import { isDevelopmentEnvironment } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const createStudentsProfile = async (req, res) => {
  try {
    const isMultipleStudents = Array.isArray(req.body)
    const studentsData = isMultipleStudents ? req.body : [req.body]

    for (const student of studentsData) {
      const { email, name, rollNumber } = student

      if (!email || !name || !rollNumber) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: email, name, rollNumber",
        })
      }
    }

    const userDocs = []
    const studentProfileData = []

    const results = []
    const errors = []

    for (const student of studentsData) {
      const { email, password, name, rollNumber, hostelId, unit, room, bed, ...otherProfileFields } = student
      const userData = {
        email,
        name,
        role: "Student",
      }

      if (password) {
        const salt = await bcrypt.genSalt(10)
        userData.password = await bcrypt.hash(password, salt)
      }

      const newUser = new User(userData)
      userDocs.push(newUser)

      studentProfileData.push({
        rollNumber,
        hostelId,
        unit,
        room,
        bed,
        ...otherProfileFields,
      })
    }

    let savedUsers
    try {
      savedUsers = await User.insertMany(userDocs, { ordered: false })
    } catch (error) {
      if (error.writeErrors) {
        error.writeErrors.forEach((err) => {
          errors.push({
            email: err.err.op.email,
            message: err.err.errmsg || "Duplicate email or validation error",
          })
        })

        savedUsers = error.insertedDocs || []
      } else {
        throw error
      }
    }

    const profileDocs = []
    const pendingAllocations = [] // Store allocation data instead of promises

    for (const savedUser of savedUsers) {
      const originalIndex = userDocs.findIndex((doc) => doc.email === savedUser.email)

      if (originalIndex !== -1) {
        const data = studentProfileData[originalIndex]
        const studentProfile = new StudentProfile({
          userId: savedUser._id,
          rollNumber: data.rollNumber,
          department: data.department,
          degree: data.degree,
          gender: data.gender,
          dateOfBirth: data.dateOfBirth,
          address: data.address,
          admissionDate: data.admissionDate,
          createdBy: req.user._id,
          lastUpdatedBy: req.user._id,
        })

        profileDocs.push(studentProfile)

        // Store allocation data for later processing
        if (data.hostelId && data.room && data.bed && data.unit) {
          pendingAllocations.push({
            studentProfile,
            userData: data,
            savedUser,
          })
        }
      }
    }

    // Save all profiles first
    let savedProfiles = []
    if (profileDocs.length > 0) {
      try {
        savedProfiles = await StudentProfile.insertMany(profileDocs, { ordered: false })
      } catch (error) {
        if (error.writeErrors) {
          error.writeErrors.forEach((err) => {
            errors.push({
              rollNumber: err.err.op.rollNumber,
              message: err.err.errmsg || "Duplicate rollNumber or validation error",
            })
          })

          savedProfiles = error.insertedDocs || []
        } else {
          throw error
        }
      }
    }

    // Now create allocations with saved profiles
    const allocationPromises = []
    for (const allocation of pendingAllocations) {
      // Find the saved version of this profile
      const savedProfile = savedProfiles.find((profile) => profile.userId.toString() === allocation.savedUser._id.toString())

      if (savedProfile) {
        allocationPromises.push(
          (async () => {
            try {
              // Room finding logic remains the same...
              let roomQuery = {
                hostelId: allocation.userData.hostelId,
                roomNumber: allocation.userData.room,
              }

              if (allocation.userData.unit) {
                const unit = await Unit.findOne({
                  hostelId: allocation.userData.hostelId,
                  unitNumber: allocation.userData.unit,
                })

                if (unit) {
                  roomQuery.unitId = unit._id
                }
              }

              const room = await Room.findOne(roomQuery)

              if (!room) {
                errors.push({
                  email: allocation.savedUser.email,
                  message: `Room not found with provided details`,
                })
                return null
              }

              // Create room allocation with the saved profile ID
              const roomAllocation = new RoomAllocation({
                userId: allocation.savedUser._id,
                studentProfileId: savedProfile._id, // Using saved profile ID
                roomId: room._id,
                bedNumber: allocation.userData.bed,
                status: "Active",
                createdBy: req.user._id,
                lastUpdatedBy: req.user._id,
              })

              const savedAllocation = await roomAllocation.save()

              // Update the student profile in database with allocation reference
              await StudentProfile.findByIdAndUpdate(savedProfile._id, { currentRoomAllocation: savedAllocation._id })

              // Update room occupancy
              await Room.findByIdAndUpdate(room._id, { $inc: { occupancy: 1 } })

              return savedAllocation
            } catch (error) {
              errors.push({
                email: allocation.savedUser.email,
                message: `Room allocation error: ${error.message}`,
              })
              return null
            }
          })()
        )
      }
    }

    // Wait for all allocations to complete
    const allocations = await Promise.all(allocationPromises)

    for (let i = 0; i < Math.min(savedUsers.length, savedProfiles.length); i++) {
      const result = {
        user: {
          _id: savedUsers[i]._id,
          email: savedUsers[i].email,
          name: savedUsers[i].name,
          role: savedUsers[i].role,
        },
        profile: savedProfiles[i],
      }

      // Add allocation if it exists
      const allocation = allocations.find((a) => a && a.studentProfileId.toString() === savedProfiles[i]._id.toString())

      if (allocation) {
        result.allocation = allocation
      }

      results.push(result)
    }

    if (errors.length === 0) {
      return res.status(201).json({
        success: true,
        data: isMultipleStudents ? results : results[0],
        message: isMultipleStudents ? `${results.length} student profiles created successfully` : "Student profile created successfully",
      })
    } else if (results.length === 0) {
      return res.status(400).json({
        success: false,
        errors,
        message: "Failed to create any student profiles",
      })
    } else {
      return res.status(207).json({
        success: true,
        data: results,
        errors,
        message: `Created ${results.length} out of ${studentsData.length} student profiles`,
      })
    }
  } catch (error) {
    console.error("Create student profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create student profile(s)",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getStudents = async (req, res) => {
  try {
    const { page = 1, limit = 10, name, email, rollNumber, department, degree, gender, hostelId, unitNumber, roomNumber, yearOfStudy, admissionDateFrom, admissionDateTo, hasAllocation, sortBy = "rollNumber", sortOrder = "asc" } = req.query

    console.log(hasAllocation, "hasAllocation")

    const query = {}

    if (rollNumber) query.rollNumber = new RegExp(rollNumber, "i")
    if (department) query.department = new RegExp(department, "i")
    if (degree) query.degree = new RegExp(degree, "i")
    if (gender) query.gender = gender
    if (yearOfStudy) query.yearOfStudy = yearOfStudy

    if (admissionDateFrom || admissionDateTo) {
      query.admissionDate = {}
      if (admissionDateFrom) query.admissionDate.$gte = new Date(admissionDateFrom)
      if (admissionDateTo) query.admissionDate.$lte = new Date(admissionDateTo)
    }

    if (name || email) {
      const userQuery = { role: "Student" }
      if (name) userQuery.name = new RegExp(name, "i")
      if (email) userQuery.email = new RegExp(email, "i")

      const matchingUsers = await User.find(userQuery).select("_id")
      if (matchingUsers.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { total: 0, page, limit, pages: 0 },
        })
      }

      query.userId = { $in: matchingUsers.map((user) => user._id) }
    }

    if (hasAllocation === "true") {
      query.currentRoomAllocation = { $ne: null }
    } else if (hasAllocation === "false") {
      query.currentRoomAllocation = null
    }

    // Pagination parameters
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const sortOption = { [sortBy]: sortOrder === "desc" ? -1 : 1 }

    // Execute the query with pagination and populate necessary fields
    const studentProfiles = await StudentProfile.find(query)
      .populate("userId", "name email profilePic") // Only select needed User fields
      .populate({
        path: "currentRoomAllocation",
        populate: {
          path: "roomId",
          populate: [
            { path: "hostelId", select: "name gender type" }, // Only select needed Hostel fields
            { path: "unitId", select: "unitNumber" }, // Only select needed Unit fields
          ],
        },
        select: "bedNumber", // Make sure to get the bed number
      })
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit))

    // Apply post-query filtering for hostel, unit, and room
    let filteredProfiles = studentProfiles

    if (hostelId || unitNumber || roomNumber) {
      filteredProfiles = studentProfiles.filter((profile) => {
        const allocation = profile.currentRoomAllocation
        if (!allocation || !allocation.roomId) return false

        if (hostelId && allocation.roomId.hostelId._id.toString() !== hostelId) {
          return false
        }

        if (unitNumber && allocation.roomId.unitId && allocation.roomId.unitId.unitNumber !== unitNumber) {
          return false
        }

        let formattedRoomNumber = roomNumber
        if (typeof formattedRoomNumber === "string") {
          formattedRoomNumber = formattedRoomNumber.toUpperCase()
        }

        if (formattedRoomNumber && !allocation.roomId.roomNumber.includes(formattedRoomNumber)) {
          return false
        }

        return true
      })
    }

    // Transform the data to the simplified format
    const simplifiedData = filteredProfiles.map((profile) => {
      const data = {
        id: profile._id,
        name: profile.userId.name,
        profilePic: profile.userId.profilePic,
        rollNumber: profile.rollNumber,
        email: profile.userId.email,
        hostel: null,
        displayRoom: null,
      }

      // Add hostel and room information if available
      if (profile.currentRoomAllocation && profile.currentRoomAllocation.roomId) {
        const room = profile.currentRoomAllocation.roomId
        const bedNumber = profile.currentRoomAllocation.bedNumber

        // Add hostel information
        data.hostel = room.hostelId ? room.hostelId.name : null

        // Format room display based on hostel type
        if (room.hostelId && room.hostelId.type === "unit-based" && room.unitId) {
          data.displayRoom = `${room.unitId.unitNumber}-${room.roomNumber}-${bedNumber}`
        } else {
          data.displayRoom = `${room.roomNumber}-${bedNumber}`
        }
      }

      return data
    })

    // Get total count for pagination
    const totalCount = await StudentProfile.countDocuments(query)

    res.status(200).json({
      success: true,
      data: simplifiedData,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCount / parseInt(limit)),
      },
    })
  } catch (error) {
    console.error("Get students error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve students",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getStudentDetails = async (req, res) => {
  const { studentProfileId } = req.params
  try {
    if (!mongoose.Types.ObjectId.isValid(studentProfileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student profile ID format",
      })
    }

    const studentProfile = await StudentProfile.findById(studentProfileId)
      .populate("userId", "name email")
      .populate({
        path: "currentRoomAllocation",
        populate: {
          path: "roomId",
          populate: [
            { path: "hostelId", select: "name type gender" },
            { path: "unitId", select: "unitNumber" },
          ],
        },
      })
      .exec()

    if (!studentProfile) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      })
    }

    const response = {
      name: studentProfile.userId.name,
      email: studentProfile.userId.email,
      rollNumber: studentProfile.rollNumber,
      gender: studentProfile.gender || "",
      dateOfBirth: studentProfile.dateOfBirth || "",
      degree: studentProfile.degree || "",
      department: studentProfile.department || "",
      year: "",
      phone: "",
      address: studentProfile.address || "",
      admissionDate: studentProfile.admissionDate || "",
    }

    if (studentProfile.currentRoomAllocation && studentProfile.currentRoomAllocation.roomId) {
      const allocation = studentProfile.currentRoomAllocation
      const room = allocation.roomId

      response.hostel = {
        id: room.hostelId._id,
        name: room.hostelId.name,
        type: room.hostelId.type,
      }

      response.room = {
        id: room._id,
        roomNumber: room.roomNumber,
      }

      response.bed = allocation.bedNumber

      if (room.hostelId.type === "unit-based" && room.unitId) {
        response.unit = {
          id: room.unitId._id,
          unitNumber: room.unitId.unitNumber,
        }
      } else {
        response.unit = null
      }
    } else {
      response.hostel = null
      response.unit = null
      response.room = null
      response.bed = null
    }

    return res.status(200).json({
      success: true,
      data: response,
    })
  } catch (error) {
    console.error("Get student details error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve student details",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getStudentProfile = async (req, res) => {
  const { userId } = req.params

  console.log(`Fetching student profile: userId=${userId || "undefined"}`)

  try {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing user ID",
      })
    }

    const studentProfile = await StudentProfile.findOne({ userId }).populate("userId", "name email role").exec()

    if (!studentProfile) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found",
      })
    }

    return res.status(200).json({
      success: true,
      data: studentProfile,
    })
  } catch (error) {
    console.error("Get student profile error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve student profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

export const updateStudentProfile = async (req, res) => {
  const { userId } = req.params

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      })
    }

    const updateData = { ...req.body }
    delete updateData.userId
    delete updateData.createdBy
    delete updateData.createdAt

    updateData.lastUpdatedBy = req.user._id
    updateData.updatedAt = Date.now()

    const updatedProfile = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      {
        new: true,
      }
    )

    if (!updatedProfile) {
      return res.status(404).json({
        success: false,
        message: "Student profile not found or update failed",
      })
    }

    res.status(200).json({
      success: true,
      data: updatedProfile,
      message: "Student profile updated successfully",
    })
  } catch (error) {
    console.error("Update student profile error:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Duplicate value: ${Object.keys(error.keyPattern)[0]} already exists`,
      })
    }

    res.status(500).json({
      success: false,
      message: "Failed to update student profile",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

// Request room change
export const requestRoomChange = async (req, res) => {
  const { userId } = req.params
  try {
    const studentProfile = await StudentProfile.findOne({ userId })
    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const currentAllocation = await RoomAllocation.findOne({
      studentId: userId,
      status: "Active",
    })
    if (!currentAllocation) {
      return res.status(404).json({ message: "No active room allocation found" })
    }

    const existingRequest = await RoomChangeRequest.findOne({
      studentId: userId,
      status: { $in: ["Pending", "Approved"] },
    })
    if (existingRequest) {
      return res.status(400).json({ message: "You already have an active room change request" })
    }

    const { requestedRoomId, requestedBedNumber, reason, priorityRequest } = req.body
    const requestedRoom = await Room.findById(requestedRoomId)
    if (!requestedRoom) {
      return res.status(404).json({ message: "Requested room not found" })
    }

    if (requestedBedNumber > requestedRoom.capacity) {
      return res.status(400).json({ message: "Invalid bed number for requested room" })
    }

    const newRequest = new RoomChangeRequest({
      studentId: userId,
      studentProfileId: studentProfile._id,
      currentAllocationId: currentAllocation._id,
      requestedRoomId,
      requestedBedNumber,
      reason,
      priorityRequest: priorityRequest || false,
      requiresWardenApproval: requestedRoom.hostelId !== currentAllocation.roomId.hostelId,
    })

    await newRequest.save()
    res.status(201).json(newRequest)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Get room change request status
export const getRoomChangeRequestStatus = async (req, res) => {
  const { userId } = req.params
  try {
    const request = await RoomChangeRequest.findOne({ studentId: userId })
      .populate("studentId", "name email role")
      .populate("studentProfileId", "rollNumber department yearOfStudy")
      .populate({
        path: "currentAllocationId",
        populate: {
          path: "roomId",
          select: "roomNumber unitId hostelId",
        },
      })
      .populate("requestedRoomId", "roomNumber capacity hostelId unitId")
      .populate("reviewedBy", "name role")
      .populate("implementedBy", "name role")
      .populate({
        path: "newAllocationId",
        populate: {
          path: "roomId",
          select: "roomNumber unitId hostelId",
        },
      })
      .exec()

    if (!request) {
      return res.status(404).json({ message: "Room change request not found" })
    }

    res.status(200).json(request)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Update room change request
export const updateRoomChangeRequest = async (req, res) => {
  const { userId } = req.params
  try {
    const existingRequest = await RoomChangeRequest.findOne({
      studentId: userId,
      status: "Pending",
    })

    if (!existingRequest) {
      return res.status(404).json({ message: "No pending room change request found" })
    }

    const { requestedRoomId, requestedBedNumber, reason, priorityRequest } = req.body
    const updateData = {}

    if (requestedRoomId) {
      const requestedRoom = await Room.findById(requestedRoomId)
      if (!requestedRoom) {
        return res.status(404).json({ message: "Requested room not found" })
      }

      if (requestedBedNumber && requestedBedNumber > requestedRoom.capacity) {
        return res.status(400).json({ message: "Invalid bed number for requested room" })
      }

      updateData.requestedRoomId = requestedRoomId

      const currentAllocation = await RoomAllocation.findById(existingRequest.currentAllocationId).populate("roomId")

      if (currentAllocation) {
        updateData.requiresWardenApproval = requestedRoom.hostelId.toString() !== currentAllocation.roomId.hostelId.toString()
      }
    } else if (requestedBedNumber) {
      const existingRoom = await Room.findById(existingRequest.requestedRoomId)
      if (requestedBedNumber > existingRoom.capacity) {
        return res.status(400).json({ message: "Invalid bed number for requested room" })
      }
    }

    if (requestedBedNumber) updateData.requestedBedNumber = requestedBedNumber
    if (reason) updateData.reason = reason
    if (priorityRequest !== undefined) updateData.priorityRequest = priorityRequest

    const updatedRequest = await RoomChangeRequest.findByIdAndUpdate(existingRequest._id, { $set: updateData }, { new: true })

    res.status(200).json(updatedRequest)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Delete room change request
export const deleteRoomChangeRequest = async (req, res) => {
  const { userId } = req.params
  try {
    // Only allow deletion of pending requests
    const request = await RoomChangeRequest.findOne({
      studentId: userId,
      status: "Pending",
    })

    if (!request) {
      return res.status(404).json({
        message: "Room change request not found or cannot be deleted in its current status",
      })
    }

    // Delete the request
    await RoomChangeRequest.findByIdAndDelete(request._id)
    res.status(200).json({ message: "Room change request cancelled successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// file a complaint
export const fileComplaint = async (req, res) => {
  const { userId } = req.params
  try {
    const { title, description, complaintType, priority, attachments, location, hostel, roomNumber } = req.body

    const newComplaint = new Complaint({
      userId,
      title,
      description,
      complaintType,
      priority,
      attachments,
      location,
      hostel,
      roomNumber,
    })
    await newComplaint.save()

    res.status(201).json(newComplaint)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all complaints created by user
export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.params.userId }).populate("userId", "name email role").exec()
    res.status(200).json(complaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// update complaint
export const updateComplaint = async (req, res) => {
  const { complaintId } = req.params
  try {
    const updatedComplaint = await Complaint.findOneAndUpdate(
      { _id: complaintId },
      { $set: { ...req.body } },
      { new: true } // return the updated complaint
    ) // findOneAndUpdate returns the original document by default
    if (!updatedComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// delete complaint
export const deleteComplaint = async (req, res) => {
  const { complaintId } = req.params
  try {
    const deletedComplaint = await Complaint.findOneAndDelete({ _id: complaintId })
    if (!deletedComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}
