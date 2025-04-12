import VisitorRequest from "../../models/VisitorRequest.js"
import User from "../../models/User.js"
import VisitorProfile from "../../models/VisitorProfile.js"
import Hostel from "../../models/Hostel.js"
import Room from "../../models/Room.js"
import Unit from "../../models/Unit.js"
import asyncHandler from "express-async-handler"

const searchVisitorRequests = asyncHandler(async (req, res) => {
  const { studentName, studentEmail, visitorName, visitorEmail, visitorPhone, reason, hostelName, allocatedRoomNumber, status, requestStartDate, requestEndDate, visitStartDate, visitEndDate, page = 1, limit = 10 } = req.query

  const query = {}
  const userQuery = {}
  const visitorProfileQuery = {}
  const hostelQuery = {}
  const roomQuery = {}

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
        return res.json({ requests: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for requesting users")
    }
  }

  if (visitorName) {
    visitorProfileQuery.name = { $regex: visitorName, $options: "i" }
  }
  if (visitorEmail) {
    visitorProfileQuery.email = { $regex: visitorEmail, $options: "i" }
  }
  if (visitorPhone) {
    visitorProfileQuery.phone = { $regex: visitorPhone, $options: "i" }
  }

  if (Object.keys(visitorProfileQuery).length > 0) {
    try {
      const profiles = await VisitorProfile.find(visitorProfileQuery).select("_id").lean()
      if (profiles.length > 0) {
        query.visitors = { $in: profiles.map((p) => p._id) }
      } else {
        return res.json({ requests: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding visitor profiles:", error)
      res.status(500)
      throw new Error("Error searching for visitor profiles")
    }
  }

  if (hostelName) {
    hostelQuery.name = { $regex: hostelName, $options: "i" }
  }

  if (Object.keys(hostelQuery).length > 0) {
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        return res.json({ requests: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  if (allocatedRoomNumber) {
    const roomNumberRegex = allocatedRoomNumber.replace(/\D/g, "")
    roomQuery.roomNumber = { $regex: roomNumberRegex, $options: "i" }

    if (query.hostelId) {
      roomQuery.hostelId = query.hostelId
    }

    try {
      const rooms = await Room.find(roomQuery).select("_id").lean()
      if (rooms.length > 0) {
        query.allocatedRooms = { $in: rooms.map((r) => r._id) }
      } else {
        return res.json({ requests: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding rooms:", error)
      res.status(500)
      throw new Error("Error searching for allocated rooms")
    }
  }

  if (reason) {
    query.reason = { $regex: reason, $options: "i" }
  }

  if (status) {
    query.status = status
  }

  if (requestStartDate || requestEndDate) {
    query.createdAt = {}
    if (requestStartDate) {
      query.createdAt.$gte = new Date(requestStartDate)
    }
    if (requestEndDate) {
      const endOfDay = new Date(requestEndDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.createdAt.$lte = endOfDay
    }
  }

  if (visitStartDate || visitEndDate) {
    const dateQuery = {}
    if (visitStartDate) {
      dateQuery.toDate = { $gte: new Date(visitStartDate) }
    }
    if (visitEndDate) {
      const endOfDay = new Date(visitEndDate)
      endOfDay.setHours(23, 59, 59, 999)
      dateQuery.fromDate = { $lte: endOfDay }
    }
    query.$and = query.$and || []
    if (dateQuery.toDate) query.$and.push({ toDate: dateQuery.toDate })
    if (dateQuery.fromDate) query.$and.push({ fromDate: dateQuery.fromDate })
    if (query.$and.length === 0) delete query.$and
  }

  try {
    const count = await VisitorRequest.countDocuments(query)
    const requests = await VisitorRequest.find(query)
      .populate("userId", "name email")
      .populate("visitors", "name email phone relation")
      .populate("hostelId", "name")
      .populate({
        path: "allocatedRooms",
        select: "roomNumber",
        populate: {
          path: "unitId",
          select: "unitNumber",
        },
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .lean()

    res.json({
      requests,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching visitor requests:", error)
    res.status(500)
    throw new Error("Server error during visitor request search")
  }
})

export { searchVisitorRequests }
