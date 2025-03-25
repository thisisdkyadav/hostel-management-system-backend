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

export const createStudentsProfiles = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const studentsData = Array.isArray(req.body) ? req.body : [req.body]

    // Validate all data upfront
    for (const student of studentsData) {
      const { email, name, rollNumber } = student
      if (!email || !name || !rollNumber) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
          success: false,
          message: "Missing required fields: email, name, rollNumber",
        })
      }
    }

    const results = []
    const errors = []

    // Bulk create users in a single operation
    const userDocs = []
    const userMap = new Map()

    // Prepare user documents
    for (const student of studentsData) {
      try {
        const { email, password, name, phone, profilePic } = student

        const userData = {
          email,
          name,
          role: "Student",
          phone: phone || "",
          profilePic: profilePic || "",
        }

        if (password) {
          const salt = await bcrypt.genSalt(10)
          userData.password = await bcrypt.hash(password, salt)
        }

        const userDoc = new User(userData)
        userDocs.push(userDoc)
        userMap.set(email, userDoc)
      } catch (error) {
        errors.push({
          student: student.email || student.rollNumber,
          message: error.message,
        })
      }
    }

    // Insert all users at once
    if (userDocs.length > 0) {
      await User.insertMany(userDocs, { session })
    }

    console.log("users created")

    // Now create student profiles
    const profileDocs = []
    const profileMap = new Map()

    for (const student of studentsData) {
      try {
        const { email, rollNumber, department, degree, gender, dateOfBirth, address, admissionDate, guardian, guardianPhone } = student

        const userDoc = userMap.get(email)
        if (!userDoc) continue

        const profileData = {
          userId: userDoc._id,
          rollNumber,
          department: department || "",
          degree: degree || "",
          gender: gender || "",
          dateOfBirth: dateOfBirth || null,
          address: address || "",
          admissionDate: admissionDate || null,
          guardian: guardian || "",
          guardianPhone: guardianPhone || "",
        }

        const profileDoc = new StudentProfile(profileData)
        profileDocs.push(profileDoc)
        profileMap.set(email, profileDoc)
      } catch (error) {
        errors.push({
          student: student.email || student.rollNumber,
          message: error.message,
        })
      }
    }

    // Insert all profiles at once
    if (profileDocs.length > 0) {
      await StudentProfile.insertMany(profileDocs, { session })
    }

    console.log("profiles created")

    const allocationsToCreate = []
    const roomUpdates = new Map() // Track room occupancy updates by roomId
    const profileUpdates = new Map() // Track profile updates by profileId

    for (const student of studentsData) {
      try {
        const { email, hostelId, unit, room, bedNumber } = student

        if (!hostelId || !room || !bedNumber) continue

        const userDoc = userMap.get(email)
        const profileDoc = profileMap.get(email)

        if (!userDoc || !profileDoc) continue

        const hostel = await mongoose.model("Hostel").findById(hostelId).session(session)

        if (!hostel) {
          throw new Error(`Hostel with ID ${hostelId} not found`)
        }

        let roomQuery = {
          hostelId,
          roomNumber: room,
        }

        if (hostel.type === "unit-based") {
          if (!unit) {
            throw new Error(`Unit number is required for unit-based hostel ${hostel.name}`)
          }

          const unitDoc = await Unit.findOne({
            hostelId,
            unitNumber: unit,
          }).session(session)

          if (!unitDoc) {
            throw new Error(`Unit ${unit} not found in hostel ${hostel.name}`)
          }

          roomQuery.unitId = unitDoc._id
        }

        const roomDoc = await Room.findOne(roomQuery).session(session)

        if (!roomDoc) {
          const locationDesc = hostel.type === "unit-based" ? `unit ${unit}` : "hostel"
          throw new Error(`Room ${room} not found in ${locationDesc}`)
        }

        if (roomDoc.status !== "Active") {
          throw new Error(`Room ${room} is not active`)
        }

        // Track room occupancy change
        const roomKey = roomDoc._id.toString()
        const currentOccupancyChange = roomUpdates.get(roomKey) || 0
        const newOccupancyChange = currentOccupancyChange + 1

        // Check if we'll exceed capacity
        if (roomDoc.occupancy + newOccupancyChange > roomDoc.capacity) {
          throw new Error(`Room ${room} cannot exceed capacity`)
        }

        roomUpdates.set(roomKey, newOccupancyChange)

        const bedNum = parseInt(bedNumber)
        if (isNaN(bedNum) || bedNum <= 0 || bedNum > roomDoc.capacity) {
          throw new Error(`Invalid bed number: ${bedNumber}. Capacity is ${roomDoc.capacity}`)
        }

        // Create allocation document
        const allocationId = new mongoose.Types.ObjectId()
        const allocationData = {
          _id: allocationId,
          userId: userDoc._id,
          studentProfileId: profileDoc._id,
          hostelId,
          roomId: roomDoc._id,
          unitId: roomDoc.unitId,
          bedNumber: bedNum,
          status: "Active",
          createdBy: req.user?._id,
          lastUpdatedBy: req.user?._id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        allocationsToCreate.push(allocationData)

        // Track profile update needs
        profileUpdates.set(profileDoc._id.toString(), allocationId)

        results.push({
          user: {
            _id: userDoc._id,
            name: userDoc.name,
            email: userDoc.email,
            role: userDoc.role,
          },
          profile: profileDoc,
          allocation: allocationData,
        })
      } catch (error) {
        errors.push({
          student: student.email || student.rollNumber,
          message: error.message,
        })
      }
    }

    if (allocationsToCreate.length > 0) {
      await RoomAllocation.insertMany(allocationsToCreate, { session })
    }

    console.log("allocations created")

    if (results.length > 0) {
      await session.commitTransaction()

      const isMultipleStudents = Array.isArray(req.body)
      const responseStatus = errors.length > 0 ? 207 : 201

      return res.status(responseStatus).json({
        success: true,
        data: isMultipleStudents ? results : results[0],
        errors: errors.length > 0 ? errors : undefined,
        message: isMultipleStudents ? `Created ${results.length} out of ${studentsData.length} student profiles` : "Student profile created successfully",
      })
    } else {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        errors,
        message: "Failed to create any student profiles",
      })
    }
  } catch (error) {
    await session.abortTransaction()
    console.error("Create student profile error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to create student profile(s)",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  } finally {
    session.endSession()
  }
}

export const updateStudentsProfiles = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const studentsData = Array.isArray(req.body) ? req.body : [req.body]

    for (const student of studentsData) {
      const { rollNumber } = student
      if (!rollNumber) {
        await session.abortTransaction()
        session.endSession()
        return res.status(400).json({
          success: false,
          message: "Missing required field: rollNumber",
        })
      }
    }

    const results = []
    const errors = []

    for (const student of studentsData) {
      try {
        const { email, rollNumber } = student

        const existingProfile = await StudentProfile.findOne({ rollNumber }).populate("userId").session(session)

        if (!existingProfile) {
          throw new Error(`Student with roll number ${rollNumber} not found`)
        }

        const { name, phone, profilePic, gender, dateOfBirth, degree, department, address, admissionDate, guardian, guardianPhone, hostelId, unit, room, bedNumber } = student

        const userData = {}
        if (name) userData.name = name
        if (email) userData.email = email
        if (phone) userData.phone = phone || ""
        if (profilePic) userData.profilePic = profilePic || ""

        if (Object.keys(userData).length > 0) {
          await User.findByIdAndUpdate(existingProfile.userId._id, userData, { session })
        }

        const profileData = {}
        if (gender) profileData.gender = gender
        if (dateOfBirth) profileData.dateOfBirth = dateOfBirth
        if (department) profileData.department = department
        if (degree) profileData.degree = degree
        if (address) profileData.address = address
        if (admissionDate) profileData.admissionDate = admissionDate
        if (guardian) profileData.guardian = guardian
        if (guardianPhone) profileData.guardianPhone = guardianPhone
        profileData.lastUpdatedBy = req.user?._id

        const updatedProfile = await StudentProfile.findByIdAndUpdate(existingProfile._id, profileData, { new: true, session })

        let allocation = null
        if (hostelId && room && bedNumber) {
          const hostel = await mongoose.model("Hostel").findById(hostelId).session(session)

          if (!hostel) {
            throw new Error(`Hostel with ID ${hostelId} not found`)
          }

          let roomQuery = {
            hostelId,
            roomNumber: room,
          }

          if (hostel.type === "unit-based") {
            if (!unit) {
              throw new Error(`Unit number is required for unit-based hostel ${hostel.name}`)
            }

            const unitDoc = await Unit.findOne({
              hostelId,
              unitNumber: unit,
            }).session(session)

            if (!unitDoc) {
              throw new Error(`Unit ${unit} not found in hostel ${hostel.name}`)
            }

            roomQuery.unitId = unitDoc._id
          }

          const roomDoc = await Room.findOne(roomQuery).session(session)

          if (!roomDoc) {
            const locationDesc = hostel.type === "unit-based" ? `unit ${unit}` : "hostel"
            throw new Error(`Room ${room} not found in ${locationDesc}`)
          }

          if (roomDoc.status !== "Active") {
            throw new Error(`Room ${room} is not active`)
          }

          const bedNum = parseInt(bedNumber)
          if (isNaN(bedNum) || bedNum <= 0 || bedNum > roomDoc.capacity) {
            throw new Error(`Invalid bed number: ${bedNumber}. Capacity is ${roomDoc.capacity}`)
          }

          if (existingProfile.currentRoomAllocation) {
            const existingAllocation = await RoomAllocation.findById(existingProfile.currentRoomAllocation).session(session)

            if (existingAllocation) {
              if (existingAllocation.roomId.toString() !== roomDoc._id.toString()) {
                await Room.findByIdAndUpdate(existingAllocation.roomId, { $inc: { occupancy: -1 } }, { session })

                await Room.findByIdAndUpdate(roomDoc._id, { $inc: { occupancy: 1 } }, { session })
              }

              allocation = await RoomAllocation.findByIdAndUpdate(
                existingAllocation._id,
                {
                  hostelId,
                  roomId: roomDoc._id,
                  unitId: roomDoc.unitId,
                  bedNumber: bedNum,
                  lastUpdatedBy: req.user?._id,
                },
                { new: true, session }
              )
            }
          } else {
            if (roomDoc.occupancy >= roomDoc.capacity) {
              throw new Error(`Room ${room} is already at full capacity`)
            }

            const roomAllocation = new RoomAllocation({
              userId: existingProfile.userId._id,
              studentProfileId: existingProfile._id,
              hostelId,
              roomId: roomDoc._id,
              unitId: roomDoc.unitId,
              bedNumber: bedNum,
              status: "Active",
              createdBy: req.user?._id,
              lastUpdatedBy: req.user?._id,
            })

            allocation = await roomAllocation.save({ session })

            updatedProfile.currentRoomAllocation = allocation._id
            await updatedProfile.save({ session })
          }
        }

        results.push({
          user: {
            _id: existingProfile.userId._id,
            name: existingProfile.userId.name,
            email: existingProfile.userId.email,
            role: existingProfile.userId.role,
          },
          profile: updatedProfile,
          allocation,
        })
      } catch (error) {
        errors.push({
          student: student.email || student.rollNumber,
          message: error.message,
        })
      }
    }

    if (results.length > 0) {
      await session.commitTransaction()

      const isMultipleStudents = Array.isArray(req.body)
      const responseStatus = errors.length > 0 ? 207 : 200

      return res.status(responseStatus).json({
        success: true,
        data: isMultipleStudents ? results : results[0],
        errors: errors.length > 0 ? errors : undefined,
        message: isMultipleStudents ? `Updated ${results.length} out of ${studentsData.length} student profiles` : "Student profile updated successfully",
      })
    } else {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        errors,
        message: "Failed to update any student profiles",
      })
    }
  } catch (error) {
    await session.abortTransaction()
    console.error("Update student profile error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update student profile(s)",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  } finally {
    session.endSession()
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
        userId: profile.userId._id,
        id: profile._id,
        name: profile.userId.name,
        profilePic: profile.userId.profilePic,
        rollNumber: profile.rollNumber,
        email: profile.userId.email,
        hostel: null,
        displayRoom: null,
        gender: profile.gender,
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
  const { userId } = req.params
  try {
    const studentProfile = await StudentProfile.getFullStudentData(userId)

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
    console.error("Get student details error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve student details",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getMultipleStudentDetails = async (req, res) => {
  try {
    const { userIds } = req.body

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide an array of user IDs",
      })
    }

    if (userIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: "Maximum of 50 student profiles can be fetched at once",
      })
    }

    const studentsData = await StudentProfile.getFullStudentData(userIds)

    console.log(studentsData, "studentsData")

    if (studentsData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No student profiles found",
      })
    }

    const foundUserIds = studentsData.map((student) => student.userId.toString())
    const missingUserIds = userIds.filter((id) => !foundUserIds.includes(id))

    const errors = missingUserIds.map((userId) => ({
      userId,
      message: "Student profile not found",
    }))

    const responseStatus = errors.length > 0 ? 207 : 200

    return res.status(responseStatus).json({
      success: true,
      data: studentsData,
      errors: errors.length > 0 ? errors : undefined,
      message: `Retrieved ${studentsData.length} out of ${userIds.length} student profiles`,
    })
  } catch (error) {
    console.error("Get multiple student details error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve student details",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getStudentProfile = async (req, res) => {
  const user = req.user

  try {
    const studentProfile = await StudentProfile.getFullStudentData(user._id)

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
  const { name, email, rollNumber, phone, gender, dateOfBirth, address, department, degree, admissionDate, guardian, guardianPhone } = req.body

  try {
    const updatedUser = await User.findByIdAndUpdate(userId, { name, email, phone }, { new: true })

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found or update failed",
      })
    }

    const updateData = {
      rollNumber,
      gender,
      dateOfBirth,
      address,
      department,
      degree,
      admissionDate,
      guardian,
      guardianPhone,
    }

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

export const createRoomChangeRequest = async (req, res) => {
  const user = req.user

  try {
    const { currentAllocationId, preferredRoom, preferredUnit, reason } = req.body

    console.log("body", req.body, user)

    if (!currentAllocationId || !preferredRoom || !preferredUnit || !reason) {
      return res.status(400).json({ message: "All fields are required", success: false })
    }

    const currentAllocation = await RoomAllocation.findById(currentAllocationId).populate("roomId")
    if (!currentAllocation) {
      return res.status(404).json({ message: "Current allocation not found", success: false })
    }

    console.log("currentAllocation", currentAllocation)

    if (currentAllocation.userId.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to create this request", success: false })
    }

    const requestedUnit = await Unit.findOne({ unitNumber: preferredUnit, hostelId: currentAllocation.hostelId }).populate("hostelId")

    if (!requestedUnit) {
      return res.status(404).json({ message: "Requested unit not found", success: false })
    }

    const requestedRoom = await Room.findOne({ roomNumber: preferredRoom, unitId: requestedUnit._id }).populate("unitId").populate("hostelId")

    if (!requestedRoom) {
      return res.status(404).json({ message: "Requested room not found", success: false })
    }

    const newRequest = new RoomChangeRequest({
      userId: user._id,
      hostelId: currentAllocation.hostelId,
      studentProfileId: currentAllocation.studentProfileId,
      currentAllocationId,
      requestedUnitId: requestedUnit._id,
      requestedRoomId: requestedRoom._id,
      reason,
    })

    const savedRequest = await newRequest.save()

    res.status(201).json({
      message: "Room change request created successfully",
      success: true,
      data: savedRequest,
    })
  } catch (error) {
    console.error("Error creating room change request:", error)
    res.status(500).json({
      message: "Error creating room change request",
      error: error.message,
    })
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
