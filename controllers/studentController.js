import StudentProfile from "../models/StudentProfile.js"
import Complaint from "../models/Complaint.js"
import Events from "../models/Event.js"
// import RoomChangeRequest from "../models/RoomChangeRequest.js"
import RoomAllocation from "../models/RoomAllocation.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import LostAndFound from "../models/LostAndFound.js"
import mongoose from "mongoose"
import { isDevelopmentEnvironment } from "../config/environment.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"
import { formatDate } from "../utils/utils.js"
import Hostel from "../models/Hostel.js"

export const createStudentsProfiles = async (req, res) => {
  const session = await mongoose.startSession()
  const studentsData = Array.isArray(req.body) ? req.body : [req.body]
  let results = []
  let errors = []

  try {
    await session.withTransaction(async () => {
      const userOps = []
      const profileOps = []
      await Promise.all(
        studentsData.map(async (student) => {
          let { email, name, rollNumber, password, phone, profileImage } = student

          // Trim whitespace from email
          if (email) email = email.trim()

          if (!email || !name || !rollNumber) {
            errors.push({
              student: student.rollNumber || student.email,
              message: "Missing required fields: email, name, rollNumber",
            })
            return
          }

          const salt = await bcrypt.genSalt(10)
          const hashedPassword = await bcrypt.hash(password || rollNumber, salt)

          const userData = {
            email,
            name,
            role: "Student",
            phone: phone || "",
            profileImage: profileImage || "",
            password: hashedPassword,
          }

          userOps.push({
            insertOne: { document: userData },
            metadata: { student },
          })
        })
      )

      if (userOps.length > 0) {
        const bulkUserOps = userOps.map((op) => op.insertOne.document)
        const userInsertResult = await User.collection.insertMany(bulkUserOps, { session })
        const insertedUserIds = Object.values(userInsertResult.insertedIds)

        userOps.forEach((op, index) => {
          const student = op.metadata.student
          const { email, rollNumber, department, degree, gender, dateOfBirth, address, admissionDate, guardian, guardianPhone, guardianEmail } = student
          const userId = insertedUserIds[index]
          const profileData = {
            userId,
            rollNumber,
            department: department || "",
            degree: degree || "",
            gender: gender || "",
            dateOfBirth: formatDate(dateOfBirth) || null,
            address: address || "",
            admissionDate: formatDate(admissionDate) || null,
            guardian: guardian || "",
            guardianPhone: guardianPhone || "",
            guardianEmail: guardianEmail || "",
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

    const rollNumbers = []
    for (const student of studentsData) {
      if (!student.rollNumber) {
        errors.push({
          student: student.email || student.rollNumber || "Unknown",
          message: "Missing required field: rollNumber",
        })
      } else {
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

    const existingProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    })
      .populate("userId")
      .session(session)

    const profileMap = {}
    existingProfiles.forEach((profile) => {
      profileMap[profile.rollNumber] = profile
    })

    const userBulkOps = []
    const profileBulkOps = []

    for (const student of studentsData) {
      const roll = student.rollNumber
      if (!roll) continue
      const existingProfile = profileMap[roll.toUpperCase()]
      if (!existingProfile) {
        errors.push({
          student: roll,
          message: `Student with roll number ${roll} not found`,
        })
        continue
      }

      // Handle user updates
      const userUpdate = {}
      if (student.name) userUpdate.name = student.name
      if (student.email) userUpdate.email = student.email ? student.email.trim() : student.email
      if (student.password) {
        userUpdate.password = await bcrypt.hash(student.password, 10)
      }
      if (student.phone !== undefined) userUpdate.phone = student.phone || ""
      if (student.profileImage !== undefined) userUpdate.profileImage = student.profileImage || ""

      if (Object.keys(userUpdate).length > 0) {
        userBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile.userId._id },
            update: { $set: userUpdate },
          },
        })
      }

      // Handle profile updates
      const profileUpdate = {}
      if (student.gender !== undefined) profileUpdate.gender = student.gender
      if (student.dateOfBirth !== undefined) profileUpdate.dateOfBirth = formatDate(student.dateOfBirth)
      if (student.department !== undefined) profileUpdate.department = student.department
      if (student.degree !== undefined) profileUpdate.degree = student.degree
      if (student.address !== undefined) profileUpdate.address = student.address
      if (student.admissionDate !== undefined) profileUpdate.admissionDate = formatDate(student.admissionDate)
      if (student.guardian !== undefined) profileUpdate.guardian = student.guardian
      if (student.guardianPhone !== undefined) profileUpdate.guardianPhone = student.guardianPhone
      if (student.guardianEmail !== undefined) profileUpdate.guardianEmail = student.guardianEmail

      // Only add lastUpdatedBy if there are other profile fields to update
      if (Object.keys(profileUpdate).length > 0 && req.user?._id) {
        profileUpdate.lastUpdatedBy = req.user._id

        profileBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile._id },
            update: { $set: profileUpdate },
          },
        })
      }

      results.push({
        rollNumber: roll,
        userId: existingProfile.userId._id,
        updated: {
          user: Object.keys(userUpdate).length > 0,
          profile: Object.keys(profileUpdate).length > 0,
        },
      })
    }

    // Only perform bulk operations if there are operations to perform
    if (userBulkOps.length > 0) {
      await User.bulkWrite(userBulkOps, { session })
    }

    if (profileBulkOps.length > 0) {
      await StudentProfile.bulkWrite(profileBulkOps, { session })
    }

    // If no updates were made to either users or profiles, return a message
    if (userBulkOps.length === 0 && profileBulkOps.length === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(200).json({
        success: true,
        message: "No updates were needed for the provided data",
        data: results,
      })
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
    const hostelId = req.params.hostelId
    const allocations = Array.isArray(req.body) ? req.body : [req.body]
    const results = []
    const errors = []

    const hostelData = await Hostel.findById(hostelId)
    if (!hostelData) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({
        success: false,
        message: "Hostel not found",
      })
    }

    const selectedHostelType = hostelData.type
    const requiredFields = selectedHostelType === "unit-based" ? ["unit", "room", "bedNumber", "rollNumber"] : ["room", "bedNumber", "rollNumber"]

    const validAllocations = []
    for (const alloc of allocations) {
      const { unit, room, bedNumber, rollNumber } = alloc

      // Check required fields based on hostel type
      let missingFields = false
      if (selectedHostelType === "unit-based") {
        if (!unit || !room || bedNumber === undefined || !rollNumber) {
          missingFields = true
        }
      } else {
        // room-only
        if (!room || bedNumber === undefined || !rollNumber) {
          missingFields = true
        }
      }

      if (missingFields) {
        errors.push({
          rollNumber: rollNumber || "Unknown",
          message: `Missing required fields: ${requiredFields.join(", ")}`,
        })
      } else {
        validAllocations.push({
          ...alloc,
          rollNumber: rollNumber.toUpperCase(),
        })
      }
    }

    if (validAllocations.length === 0) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({
        success: false,
        errors,
        message: "No valid allocation data provided",
      })
    }

    const rollNumbers = validAllocations.map((a) => a.rollNumber)
    const studentProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    }).session(session)

    const profileMap = {}
    studentProfiles.forEach((profile) => {
      profileMap[profile.rollNumber] = profile
    })

    let unitMap = {}
    let roomMap = {}
    let rooms = []

    // Handle unit-based hostels
    if (selectedHostelType === "unit-based") {
      const unitNumbers = [...new Set(validAllocations.map((a) => a.unit))]
      const units = await Unit.find({
        unitNumber: { $in: unitNumbers },
        hostelId,
      }).session(session)

      units.forEach((unit) => {
        unitMap[unit.unitNumber] = unit
      })

      const unitIds = units.map((unit) => unit._id)
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))]
      rooms = await Room.find({
        unitId: { $in: unitIds },
        roomNumber: { $in: roomNumbers },
      }).session(session)

      rooms.forEach((room) => {
        const unitNumber = units.find((u) => u._id.equals(room.unitId))?.unitNumber
        if (unitNumber) {
          roomMap[`${unitNumber}:${room.roomNumber}`] = room
        }
      })
    }
    // Handle room-only hostels
    else {
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))]
      rooms = await Room.find({
        hostelId,
        roomNumber: { $in: roomNumbers },
        unitId: { $exists: false },
      }).session(session)

      rooms.forEach((room) => {
        roomMap[room.roomNumber] = room
      })
    }

    const roomIds = rooms.map((room) => room._id)
    const bedNumbers = validAllocations.map((a) => a.bedNumber)
    const existingAllocations = await RoomAllocation.find({
      roomId: { $in: roomIds },
      bedNumber: { $in: bedNumbers },
    }).session(session)

    const existingAllocMap = {}
    existingAllocations.forEach((alloc) => {
      existingAllocMap[`${alloc.roomId}:${alloc.bedNumber}`] = alloc
    })

    const studentIds = studentProfiles.map((profile) => profile._id)
    const currentAllocations = await RoomAllocation.find({
      studentProfileId: { $in: studentIds },
    }).session(session)

    const currentAllocMap = {}
    currentAllocations.forEach((alloc) => {
      currentAllocMap[alloc.studentProfileId.toString()] = alloc
    })

    const allocationsToDelete = []
    const allocationsToCreate = []

    for (const alloc of validAllocations) {
      const { unit, room, bedNumber, rollNumber } = alloc

      const studentProfile = profileMap[rollNumber]
      if (!studentProfile) {
        errors.push({ rollNumber, message: "Student profile not found" })
        continue
      }

      let roomDoc = null

      // Find the room based on hostel type
      if (selectedHostelType === "unit-based") {
        const unitDoc = unitMap[unit]
        if (!unitDoc) {
          errors.push({ rollNumber, message: "Unit not found" })
          continue
        }

        roomDoc = roomMap[`${unit}:${room}`]
        if (!roomDoc) {
          errors.push({ rollNumber, message: "Room not found in specified unit" })
          continue
        }
      } else {
        roomDoc = roomMap[room]
        if (!roomDoc) {
          errors.push({ rollNumber, message: "Room not found" })
          continue
        }
      }

      if (roomDoc.status !== "Active") {
        errors.push({ rollNumber, message: "Room is not active" })
        continue
      }

      const existingAlloc = existingAllocMap[`${roomDoc._id}:${bedNumber}`]
      if (existingAlloc) {
        allocationsToDelete.push(existingAlloc._id)
      }

      const currentAlloc = currentAllocMap[studentProfile._id.toString()]
      if (currentAlloc) {
        if (!currentAlloc.roomId.equals(roomDoc._id) || currentAlloc.bedNumber !== bedNumber) {
          allocationsToDelete.push(currentAlloc._id)
        }
      }

      const newAllocation = new RoomAllocation({
        userId: studentProfile.userId,
        studentProfileId: studentProfile._id,
        hostelId: roomDoc.hostelId,
        roomId: roomDoc._id,
        unitId: roomDoc.unitId, // This will be undefined for room-only hostels
        bedNumber,
      })

      allocationsToCreate.push(newAllocation)
      results.push({
        rollNumber,
        allocation: newAllocation,
      })
    }

    if (allocationsToDelete.length > 0) {
      await RoomAllocation.deleteMany({
        _id: { $in: allocationsToDelete },
      }).session(session)
    }

    if (allocationsToCreate.length > 0) {
      await RoomAllocation.insertMany(allocationsToCreate, { session })
    }

    await session.commitTransaction()
    session.endSession()

    if (errors.length > 0) {
      return res.status(207).json({
        success: true,
        data: results,
        errors,
        message: "Room allocations updated with some errors. Please review the errors for details.",
      })
    } else {
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
  const user = req.user
  try {
    let query = req.query

    if (user.hostel) {
      query.hostelId = user.hostel._id.toString()
    }

    const studentProfilesResult = await StudentProfile.searchStudents(query)
    const studentProfiles = studentProfilesResult[0].data
    const totalCount = studentProfilesResult[0].totalCount[0]?.count || 0

    res.status(200).json({
      success: true,
      data: studentProfiles,
      pagination: {
        total: totalCount,
        page: parseInt(query.page),
        limit: parseInt(query.limit),
        pages: Math.ceil(totalCount / parseInt(query.limit)),
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
  const { name, email, rollNumber, phone, gender, dateOfBirth, address, department, degree, admissionDate, guardian, guardianPhone, guardianEmail, profileImage } = req.body

  try {
    // Trim whitespace from email if it exists
    const trimmedEmail = email ? email.trim() : email

    const updatedUser = await User.findByIdAndUpdate(userId, { name, email: trimmedEmail, phone, profileImage }, { new: true })

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
      guardianEmail,
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
        profileImage: studentProfile.profileImage || null,
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
            select: "name profileImage",
          },
        })

        const roomCapacity = roomAllocation.roomId.capacity || 0

        let displayRoom
        if (studentProfile.hostelType === "unit-based" && studentProfile.unit) {
          displayRoom = roomCapacity > 1 ? `${studentProfile.unit}${studentProfile.room}(${studentProfile.bedNumber})` : `${studentProfile.unit}${studentProfile.room}`
        } else {
          displayRoom = roomCapacity > 1 ? `${studentProfile.room}(${studentProfile.bedNumber})` : `${studentProfile.room}`
        }

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
            avatar: allocation.studentProfileId.userId?.profileImage || null,
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

    const eventsQuery = {
      $or: [{ hostelId: studentProfile.hostelId.toString() }, { hostelId: null }, { gender: studentProfile.gender }, { gender: null }],
    }
    const events = await Events.find(eventsQuery)

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

export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.params.userId }).populate("userId", "name email role").exec()
    res.status(200).json(complaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

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

export const getStudentIdCard = async (req, res) => {
  const { userId } = req.params
  const user = req.user
  try {
    if (user.role === "Student" && user._id.toString() !== userId) {
      return res.status(403).json({ message: "Unauthorized" })
    }

    // get only the idCard field
    const studentProfile = await StudentProfile.findOne({ userId }, "idCard")

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    res.status(200).json(studentProfile.idCard)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const uploadStudentIdCard = async (req, res) => {
  const { front, back } = req.body
  const user = req.user
  try {
    if (user.role !== "Student") {
      return res.status(403).json({ message: "Unauthorized" })
    }

    const studentProfile = await StudentProfile.findOne({ userId: user._id })
    studentProfile.idCard = { front, back }
    await studentProfile.save()

    res.status(200).json({ message: "Student ID card uploaded successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const bulkUpdateStudentsStatus = async (req, res) => {
  const { status, rollNumbers } = req.body
  try {
    // Find existing students with the provided roll numbers
    const existingStudents = await StudentProfile.find({ rollNumber: { $in: rollNumbers } })
    const existingRollNumbers = existingStudents.map((student) => student.rollNumber)

    // Find roll numbers that don't exist
    const unsuccessfulRollNumbers = rollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber))

    // Update only existing students
    const students = await StudentProfile.updateMany({ rollNumber: { $in: existingRollNumbers } }, { status })

    if (students.modifiedCount === 0) {
      return res.status(404).json({
        message: "No students found to update",
        unsuccessfulRollNumbers: rollNumbers,
      })
    }

    res.status(200).json({
      message: "Students status updated successfully",
      updatedCount: students.modifiedCount,
      unsuccessfulRollNumbers: unsuccessfulRollNumbers,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}
