import StudentProfile from "../models/StudentProfile.js"
import Complaint from "../models/Complaint.js"
import Events from "../models/Events.js"
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
  const studentsData = Array.isArray(req.body) ? req.body : [req.body]
  let results = []
  let errors = []

  try {
    await session.withTransaction(async () => {
      const userOps = []
      const profileOps = []
      studentsData.forEach((student) => {
        const { email, name, rollNumber, password, phone, profilePic, department, degree, gender, dateOfBirth, address, admissionDate, guardian, guardianPhone } = student

        if (!email || !name || !rollNumber) {
          errors.push({
            student: student.rollNumber || student.email,
            message: "Missing required fields: email, name, rollNumber",
          })
          return
        }

        const userData = {
          email,
          name,
          role: "Student",
          phone: phone || "",
          profilePic: profilePic || "",
        }

        userOps.push({
          insertOne: { document: userData },
          metadata: { student, password },
        })
      })

      if (userOps.length > 0) {
        const bulkUserOps = userOps.map((op) => op.insertOne.document)
        const userInsertResult = await User.collection.insertMany(bulkUserOps, { session })
        const insertedUserIds = userInsertResult.insertedIds

        let index = 0
        studentsData.forEach((student) => {
          const { email, rollNumber, department, degree, gender, dateOfBirth, address, admissionDate, guardian, guardianPhone } = student
          if (!email || !rollNumber) return
          const userId = insertedUserIds[index++]
          const profileData = {
            userId,
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
          profileOps.push({
            insertOne: { document: profileData },
          })
        })

        if (profileOps.length > 0) {
          const profileInsertResult = await StudentProfile.collection.insertMany(
            profileOps.map((op) => op.insertOne.document),
            { session }
          )
          Object.values(userInsertResult.insertedIds).forEach((id, idx) => {
            results.push({
              user: { _id: id },
              profile: {
                _id: profileInsertResult.insertedIds[idx],
                rollNumber: studentsData[idx].rollNumber,
              },
            })
          })
        }
      }
    })
    const isMultipleStudents = Array.isArray(req.body)
    const responseStatus = errors.length > 0 ? 207 : 201
    return res.status(responseStatus).json({
      success: true,
      data: isMultipleStudents ? results : results[0],
      errors: errors.length > 0 ? errors : undefined,
      message: isMultipleStudents ? `Created ${results.length} out of ${studentsData.length} student profiles` : "Student profile created successfully",
    })
  } catch (error) {
    if (session.inTransaction()) {
      try {
        await session.abortTransaction()
      } catch (abortErr) {
        console.error("Abort transaction error:", abortErr)
      }
    }
    return res.status(500).json({
      success: false,
      message: "Failed to create student profiles",
      error: error.message,
    })
  } finally {
    await session.endSession()
  }
}

export const updateStudentsProfiles = async (req, res) => {
  const session = await mongoose.startSession()
  await session.startTransaction()
  try {
    const studentsData = Array.isArray(req.body) ? req.body : [req.body]
    const errors = []
    const results = []

    // Validate and collect rollNumbers
    const rollNumbers = []
    for (const student of studentsData) {
      if (!student.rollNumber) {
        errors.push({
          student: student.email || student.rollNumber,
          message: "Missing required field: rollNumber",
        })
      } else {
        // Assume roll numbers are stored in uppercase
        rollNumbers.push(student.rollNumber.toUpperCase())
      }
    }
    if (rollNumbers.length === 0) {
      await session.abortTransaction()
      return res.status(400).json({
        success: false,
        errors,
        message: "No valid rollNumber provided",
      })
    }

    // Retrieve existing profiles by rollNumber
    const existingProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    })
      .populate("userId")
      .session(session)

    // Build a map of rollNumber => profile
    const profileMap = {}
    existingProfiles.forEach((profile) => {
      // rollNumber is stored uppercase according to schema config
      profileMap[profile.rollNumber] = profile
    })

    // Prepare bulk update operations for User and StudentProfile
    const userBulkOps = []
    const profileBulkOps = []

    for (const student of studentsData) {
      const roll = student.rollNumber
      if (!roll) continue
      // Use uppercase for lookup
      const existingProfile = profileMap[roll.toUpperCase()]
      if (!existingProfile) {
        errors.push({
          student: roll,
          message: `Student with roll number ${roll} not found`,
        })
        continue
      }
      // Prepare User update data
      const userUpdate = {}
      if (student.name) userUpdate.name = student.name
      if (student.email) userUpdate.email = student.email
      if (student.phone !== undefined) userUpdate.phone = student.phone || ""
      if (student.profilePic) userUpdate.profilePic = student.profilePic || ""
      if (Object.keys(userUpdate).length > 0) {
        userBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile.userId._id },
            update: { $set: userUpdate },
          },
        })
      }
      // Prepare StudentProfile update data
      const profileUpdate = {}
      if (student.gender) profileUpdate.gender = student.gender
      if (student.dateOfBirth) profileUpdate.dateOfBirth = student.dateOfBirth
      if (student.department) profileUpdate.department = student.department
      if (student.degree) profileUpdate.degree = student.degree
      if (student.address) profileUpdate.address = student.address
      if (student.admissionDate) profileUpdate.admissionDate = student.admissionDate
      if (student.guardian) profileUpdate.guardian = student.guardian
      if (student.guardianPhone) profileUpdate.guardianPhone = student.guardianPhone
      // Always update lastUpdatedBy
      profileUpdate.lastUpdatedBy = req.user?._id
      if (Object.keys(profileUpdate).length > 0) {
        profileBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile._id },
            update: { $set: profileUpdate },
          },
        })
      }
      // Return minimal result info
      results.push({ rollNumber: roll, userId: existingProfile.userId._id })
    }

    // Execute bulk update operations in parallel (if any)
    if (userBulkOps.length > 0) {
      await User.bulkWrite(userBulkOps, { session })
    }
    if (profileBulkOps.length > 0) {
      await StudentProfile.bulkWrite(profileBulkOps, { session })
    }

    await session.commitTransaction()
    session.endSession()
    const isMultipleStudents = Array.isArray(req.body)
    const responseStatus = errors.length > 0 ? 207 : 200
    return res.status(responseStatus).json({
      success: true,
      data: isMultipleStudents ? results : results[0],
      errors: errors.length > 0 ? errors : undefined,
      message: isMultipleStudents ? `Updated ${results.length} out of ${studentsData.length} student profiles` : "Student profile updated successfully",
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()
    console.error("Update student profile error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to update student profile(s)",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const updateRoomAllocations = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const allocations = Array.isArray(req.body) ? req.body : [req.body]
    const results = []
    const errors = []

    for (const alloc of allocations) {
      const { unit, room, bedNumber, rollNumber } = alloc
      if (!unit || !room || bedNumber === undefined || !rollNumber) {
        errors.push({ rollNumber, message: "Missing required fields" })
        continue
      }

      const studentProfile = await StudentProfile.findOne({ rollNumber: rollNumber.toUpperCase() }).session(session)
      if (!studentProfile) {
        errors.push({ rollNumber, message: "Student profile not found" })
        continue
      }

      const unitDoc = await Unit.findOne({ unitNumber: unit }).session(session)
      if (!unitDoc) {
        errors.push({ rollNumber, message: "Unit not found" })
        continue
      }
      const roomDoc = await Room.findOne({ unitId: unitDoc._id, roomNumber: room }).session(session)
      if (!roomDoc) {
        errors.push({ rollNumber, message: "Room not found in specified unit" })
        continue
      }

      if (roomDoc.status !== "Active") {
        errors.push({ rollNumber, message: "Room is not active" })
        continue
      }

      const existingAllocation = await RoomAllocation.findOne({ roomId: roomDoc._id, bedNumber }).session(session)
      if (existingAllocation) {
        await RoomAllocation.deleteOne({ _id: existingAllocation._id }).session(session)
      }

      if (studentProfile.currentRoomAllocation) {
        const currentAlloc = await RoomAllocation.findById(studentProfile.currentRoomAllocation).session(session)
        if (currentAlloc) {
          if (String(currentAlloc.roomId) !== String(roomDoc._id) || currentAlloc.bedNumber !== bedNumber) {
            await RoomAllocation.deleteOne({ _id: currentAlloc._id }).session(session)
          }
        }
      }

      const newAllocation = new RoomAllocation({
        userId: studentProfile.userId,
        studentProfileId: studentProfile._id,
        hostelId: roomDoc.hostelId,
        roomId: roomDoc._id,
        unitId: roomDoc.unitId,
        bedNumber,
      })
      await newAllocation.save({ session })

      results.push({
        rollNumber: studentProfile.rollNumber,
        allocation: newAllocation,
      })
    }

    if (errors.length > 0) {
      await session.commitTransaction()
      session.endSession()
      return res.status(207).json({
        success: true,
        data: results,
        errors,
        message: "Room allocations updated with some errors. Please review the errors for details.",
      })
    } else {
      await session.commitTransaction()
      session.endSession()
      return res.status(200).json({
        success: true,
        data: results,
        message: "Room allocations updated successfully",
      })
    }
  } catch (err) {
    await session.abortTransaction()
    session.endSession()
    console.error("Error in updateRoomAllocations:", err)
    return res.status(500).json({
      success: false,
      message: "Failed to update room allocations",
      error: err.message,
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

export const getStudentDashboard = async (req, res) => {
  const user = req.user

  try {
    const studentProfile = await StudentProfile.getFullStudentData(user._id)

    if (!studentProfile) return res.status(404).json({ success: false, message: "Student profile not found" })

    const dashboardData = {
      profile: {
        name: studentProfile.name,
        rollNumber: studentProfile.rollNumber,
        degree: studentProfile.degree,
        year: studentProfile.year,
        hostelName: studentProfile.hostel || null,
      },
      roomInfo: null,
      stats: {
        complaints: {
          pending: 0,
          inProgress: 0,
          resolved: 0,
          total: 0,
        },
        lostAndFound: {
          active: 0,
          claimed: 0,
          total: 0,
        },
        events: {
          upcoming: 0,
          past: 0,
          total: 0,
        },
      },
      activeComplaints: [],
      upcomingEvents: [],
    }

    if (studentProfile.allocationId) {
      const roomAllocation = await RoomAllocation.findById(studentProfile.allocationId)
        .populate({
          path: "roomId",
          populate: {
            path: "unitId",
            select: "unitNumber",
          },
        })
        .populate("hostelId", "name type")

      if (roomAllocation) {
        const allRoomAllocations = await RoomAllocation.find({
          roomId: roomAllocation.roomId._id,
          _id: { $ne: studentProfile.allocationId },
        }).populate({
          path: "studentProfileId",
          select: "rollNumber userId",
          populate: {
            path: "userId",
            select: "name profilePic",
          },
        })

        let displayRoom
        if (studentProfile.hostelType === "unit-based" && studentProfile.unit) {
          displayRoom = `${studentProfile.unit}${studentProfile.room}(${studentProfile.bedNumber})`
        } else {
          displayRoom = `${studentProfile.room}(${studentProfile.bedNumber})`
        }

        const roomCapacity = roomAllocation.roomId.capacity || 0
        const beds = []
        for (let i = 1; i <= roomCapacity; i++) {
          const allocation = [roomAllocation, ...allRoomAllocations].find((a) => a.bedNumber === i)
          beds.push({
            id: i,
            bedNumber: i.toString(),
            isOccupied: !!allocation,
            isCurrentUser: allocation && allocation._id.toString() === studentProfile.allocationId.toString(),
          })
        }

        const roommates = allRoomAllocations
          .filter((allocation) => allocation.studentProfileId)
          .map((allocation) => ({
            rollNumber: allocation.studentProfileId.rollNumber,
            name: allocation.studentProfileId.userId?.name || "Unknown",
            avatar: allocation.studentProfileId.userId?.profilePic || null,
          }))

        dashboardData.roomInfo = {
          roomNumber: displayRoom,
          bedNumber: studentProfile.bedNumber,
          hostelName: studentProfile.hostel,
          occupiedBeds: allRoomAllocations.length + 1,
          totalBeds: roomCapacity,
          beds,
          roommates,
        }
      }
    }

    const complaints = await Complaint.find({ userId: user._id })

    if (complaints.length > 0) {
      dashboardData.stats.complaints = {
        pending: complaints.filter((c) => c.status === "Pending").length,
        inProgress: complaints.filter((c) => c.status === "In Progress").length,
        resolved: complaints.filter((c) => c.status === "Resolved").length,
        total: complaints.length,
      }

      dashboardData.activeComplaints = complaints
        .filter((c) => c.status !== "Resolved")
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((complaint) => ({
          id: complaint._id,
          title: complaint.title,
          status: complaint.status,
          priority: complaint.priority,
          category: complaint.category,
          description: complaint.description,
          hostel: studentProfile.hostel,
          roomNumber: dashboardData.roomInfo?.roomNumber || "",
          createdDate: complaint.createdAt,
        }))
    }

    const lostAndFoundItems = await LostAndFound.find()

    if (lostAndFoundItems.length > 0) {
      dashboardData.stats.lostAndFound = {
        active: lostAndFoundItems.filter((item) => item.status === "Active").length,
        claimed: lostAndFoundItems.filter((item) => item.status === "Claimed").length,
        total: lostAndFoundItems.length,
      }
    }

    const now = new Date()

    console.log(studentProfile.hostelId, "studentProfile.hostel")

    const events = await Events.find({ hostelId: studentProfile.hostelId })

    console.log(events, "events")

    if (events.length > 0) {
      const upcomingEvents = events.filter((e) => new Date(e.dateAndTime) > now)
      const pastEvents = events.filter((e) => new Date(e.dateAndTime) <= now)

      dashboardData.stats.events = {
        upcoming: upcomingEvents.length,
        past: pastEvents.length,
        total: events.length,
      }
      dashboardData.upcomingEvents = upcomingEvents
        .sort((a, b) => new Date(a.dateAndTime) - new Date(b.dateAndTime))
        .slice(0, 5)
        .map((event) => ({
          _id: event._id,
          eventName: event.eventName,
          description: event.description,
          dateAndTime: event.dateAndTime,
        }))
    }

    return res.status(200).json({
      success: true,
      data: dashboardData,
    })
  } catch (error) {
    console.error("Get student dashboard error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to retrieve student dashboard information",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
}

export const createRoomChangeRequest = async (req, res) => {
  const user = req.user

  try {
    const { currentAllocationId, preferredRoom, preferredUnit, reason } = req.body

    console.log("body", req.body, user)

    if (!currentAllocationId) {
      return res.status(400).json({ message: "No room is allocated to you", success: false })
    }

    if (!preferredRoom || !preferredUnit || !reason) {
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
