import RoomAllocation from "../../models/RoomAllocation.js"
import User from "../../models/User.js"
import StudentProfile from "../../models/StudentProfile.js"
import Hostel from "../../models/Hostel.js"
import Room from "../../models/Room.js"
import Unit from "../../models/Unit.js"
import asyncHandler from "express-async-handler"

const searchAllocations = asyncHandler(async (req, res) => {
  const { studentName, studentEmail, rollNumber, hostelName, unitNumber, roomNumber, bedNumber, startDate, endDate, page = 1, limit = 10 } = req.query

  const query = {}
  const userQuery = {}
  const studentProfileQuery = {}
  const hostelQuery = {}
  const roomQuery = {}
  const unitQuery = {}

  // --- Build Queries for Referenced Models ---

  // User Search
  if (studentName) {
    userQuery.name = { $regex: studentName, $options: "i" }
  }
  if (studentEmail) {
    userQuery.email = { $regex: studentEmail, $options: "i" }
  }

  if (Object.keys(userQuery).length > 0) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ allocations: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  }

  // Student Profile Search
  if (rollNumber) {
    studentProfileQuery.rollNumber = { $regex: rollNumber, $options: "i" }
  }

  if (Object.keys(studentProfileQuery).length > 0) {
    try {
      const profiles = await StudentProfile.find(studentProfileQuery).select("_id").lean()
      if (profiles.length > 0) {
        query.studentProfileId = { $in: profiles.map((p) => p._id) }
      } else {
        return res.json({ allocations: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding student profiles:", error)
      res.status(500)
      throw new Error("Error searching for student profiles")
    }
  }

  // Hostel Search
  if (hostelName) {
    hostelQuery.name = { $regex: hostelName, $options: "i" }
  }

  if (Object.keys(hostelQuery).length > 0) {
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        return res.json({ allocations: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  // Unit Search (affects Room query)
  if (unitNumber) {
    unitQuery.unitNumber = { $regex: unitNumber, $options: "i" }
    if (query.hostelId) {
      unitQuery.hostelId = query.hostelId // Filter units by already found hostel(s)
    }
  }

  // Room Search
  if (roomNumber) {
    roomQuery.roomNumber = { $regex: roomNumber, $options: "i" }
  }
  if (query.hostelId) {
    roomQuery.hostelId = query.hostelId // Filter rooms by already found hostel(s)
  }

  if (Object.keys(unitQuery).length > 0) {
    try {
      const units = await Unit.find(unitQuery).select("_id").lean()
      if (units.length > 0) {
        roomQuery.unitId = { $in: units.map((u) => u._id) }
      } else {
        return res.json({ allocations: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding units:", error)
      res.status(500)
      throw new Error("Error searching for units")
    }
  }

  if (Object.keys(roomQuery).length > 0) {
    try {
      const rooms = await Room.find(roomQuery).select("_id").lean()
      if (rooms.length > 0) {
        query.roomId = { $in: rooms.map((r) => r._id) }
      } else {
        return res.json({ allocations: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding rooms:", error)
      res.status(500)
      throw new Error("Error searching for rooms")
    }
  }

  // --- Build Main Query ---

  if (bedNumber) {
    query.bedNumber = Number(bedNumber)
  }

  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) {
      query.createdAt.$gte = new Date(startDate)
    }
    if (endDate) {
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.createdAt.$lte = endOfDay
    }
  }

  // --- Execution ---
  try {
    const count = await RoomAllocation.countDocuments(query)
    const allocations = await RoomAllocation.find(query)
      .populate({
        path: "userId",
        select: "name email", // Populate user details
      })
      .populate({
        path: "studentProfileId",
        select: "rollNumber", // Populate student profile details
      })
      .populate({
        path: "hostelId",
        select: "name", // Populate hostel details
      })
      .populate({
        path: "roomId",
        select: "roomNumber", // Populate room details
        populate: {
          path: "unitId", // Populate unit details within room
          select: "unitNumber",
        },
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 }) // Sort by creation date descending
      .lean()

    // Manually construct displayRoomNumber if needed (virtuals don't always work reliably with complex queries/lean)
    const formattedAllocations = allocations.map((alloc) => {
      let displayRoomNumber = ""
      const room = alloc.roomId
      if (room) {
        const unit = room.unitId
        if (unit && unit.unitNumber) {
          displayRoomNumber = `${unit.unitNumber}${room.roomNumber}-${alloc.bedNumber}`
        } else {
          displayRoomNumber = `${room.roomNumber}-${alloc.bedNumber}`
        }
      }
      return {
        ...alloc,
        displayRoomNumber,
      }
    })

    res.json({
      allocations: formattedAllocations,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching allocations:", error)
    res.status(500)
    throw new Error("Server error during allocation search")
  }
})

export { searchAllocations }
