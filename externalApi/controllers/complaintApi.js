import Complaint from "../../models/Complaint.js"
import User from "../../models/User.js"
import StudentProfile from "../../models/StudentProfile.js"
import Hostel from "../../models/Hostel.js"
import Room from "../../models/Room.js"
import Unit from "../../models/Unit.js"
import asyncHandler from "express-async-handler"

// Helper to find User IDs based on name/email
const findUserIds = async (name, email) => {
  const userQuery = {}
  if (name) userQuery.name = { $regex: name, $options: "i" }
  if (email) userQuery.email = { $regex: email, $options: "i" }
  if (Object.keys(userQuery).length === 0) return null // No criteria

  try {
    const users = await User.find(userQuery).select("_id").lean()
    return users.map((u) => u._id)
  } catch (error) {
    console.error("Error finding user IDs:", error)
    throw new Error("Error searching for users")
  }
}

// Helper to find Room IDs based on hostel/unit/room
const findRoomIds = async (hostelId, unitNumber, roomNumber) => {
  const roomQuery = {}
  if (hostelId) roomQuery.hostelId = hostelId
  if (roomNumber) roomQuery.roomNumber = { $regex: `^${roomNumber}$`, $options: "i" }

  if (unitNumber) {
    const unitQuery = { unitNumber: { $regex: `^${unitNumber}$`, $options: "i" } }
    if (hostelId) unitQuery.hostelId = hostelId
    try {
      const units = await Unit.find(unitQuery).select("_id").lean()
      if (units.length > 0) {
        roomQuery.unitId = { $in: units.map((u) => u._id) }
      } else {
        return [] // No matching units
      }
    } catch (error) {
      console.error("Error finding unit IDs:", error)
      throw new Error("Error searching for units")
    }
  }

  if (Object.keys(roomQuery).length === 0) return null // No criteria if only unit/room numbers were searched without hostel

  try {
    const rooms = await Room.find(roomQuery).select("_id").lean()
    return rooms.map((r) => r._id)
  } catch (error) {
    console.error("Error finding room IDs:", error)
    throw new Error("Error searching for rooms")
  }
}

// @desc    Search complaints
// @route   GET /api/external/complaints/search
// @access  Private (adjust as needed)
const searchComplaints = asyncHandler(async (req, res) => {
  const {
    complainantName,
    complainantEmail,
    complainantRollNumber,
    keyword, // Title/Description
    status,
    category,
    priority,
    hostelName,
    unitNumber,
    roomNumber,
    assignedStaffName,
    assignedStaffEmail,
    resolvedStaffName,
    resolvedStaffEmail,
    createdStartDate,
    createdEndDate,
    resolvedStartDate,
    resolvedEndDate,
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  let hostelId = null

  // --- Handle Referenced Models ---

  // Hostel
  if (hostelName) {
    try {
      const hostel = await Hostel.findOne({ name: { $regex: `^${hostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (hostel) {
        hostelId = hostel._id
        query.hostelId = hostelId
      } else {
        return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostel:", error)
      res.status(500)
      throw new Error("Error searching for hostel")
    }
  }

  // Complainant User/Profile
  let complainantUserIds = null
  if (complainantName || complainantEmail) {
    complainantUserIds = await findUserIds(complainantName, complainantEmail)
    if (!complainantUserIds || complainantUserIds.length === 0) {
      return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
    }
  }
  if (complainantRollNumber) {
    try {
      const profiles = await StudentProfile.find({ rollNumber: { $regex: complainantRollNumber, $options: "i" } })
        .select("userId")
        .lean()
      const profileUserIds = profiles.map((p) => p.userId)
      if (profileUserIds.length === 0) {
        return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
      }
      // Intersect with name/email results if they exist
      complainantUserIds = complainantUserIds ? complainantUserIds.filter((id) => profileUserIds.some((pId) => pId.equals(id))) : profileUserIds
      if (complainantUserIds.length === 0) {
        return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding student profile for complainant:", error)
      res.status(500)
      throw new Error("Error searching complainant profile")
    }
  }
  if (complainantUserIds) {
    query.userId = { $in: complainantUserIds }
  }

  // Assigned Staff
  if (assignedStaffName || assignedStaffEmail) {
    const assignedUserIds = await findUserIds(assignedStaffName, assignedStaffEmail)
    if (assignedUserIds && assignedUserIds.length > 0) {
      query.assignedTo = { $in: assignedUserIds }
    } else {
      return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
    }
  }

  // Resolved Staff
  if (resolvedStaffName || resolvedStaffEmail) {
    const resolvedUserIds = await findUserIds(resolvedStaffName, resolvedStaffEmail)
    if (resolvedUserIds && resolvedUserIds.length > 0) {
      query.resolvedBy = { $in: resolvedUserIds }
    } else {
      return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
    }
  }

  // Room/Unit
  if (roomNumber || unitNumber) {
    const roomIds = await findRoomIds(hostelId, unitNumber, roomNumber)
    if (roomIds && roomIds.length > 0) {
      query.roomId = { $in: roomIds }
      // Also filter by unitId if available from room search
      if (unitNumber) {
        const units = await Unit.find({
          _id: {
            $in: (
              await Room.find({ _id: { $in: roomIds } })
                .select("unitId")
                .lean()
            )
              .map((r) => r.unitId)
              .filter(Boolean),
          },
        })
          .select("_id")
          .lean()
        if (units.length > 0) {
          query.unitId = { $in: units.map((u) => u._id) }
        }
      }
    } else {
      return res.json({ complaints: [], page: 1, pages: 0, total: 0 })
    }
  }

  // --- Direct Fields ---

  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }, { description: { $regex: keyword, $options: "i" } }]
  }
  if (status) query.status = status
  if (category) query.category = category
  if (priority) query.priority = priority

  // Date Ranges
  if (createdStartDate || createdEndDate) {
    query.createdAt = {}
    if (createdStartDate) query.createdAt.$gte = new Date(createdStartDate)
    if (createdEndDate) {
      const endDay = new Date(createdEndDate)
      endDay.setHours(23, 59, 59, 999)
      query.createdAt.$lte = endDay
    }
  }
  if (resolvedStartDate || resolvedEndDate) {
    query.resolutionDate = {}
    if (resolvedStartDate) query.resolutionDate.$gte = new Date(resolvedStartDate)
    if (resolvedEndDate) {
      const endDay = new Date(resolvedEndDate)
      endDay.setHours(23, 59, 59, 999)
      query.resolutionDate.$lte = endDay
    }
  }

  // --- Execution ---
  try {
    const count = await Complaint.countDocuments(query)
    const complaints = await Complaint.find(query)
      .populate("userId", "name email")
      .populate("hostelId", "name")
      .populate({ path: "roomId", select: "roomNumber", populate: { path: "unitId", select: "unitNumber" } })
      .populate("assignedTo", "name email")
      .populate("resolvedBy", "name email")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })
      .lean()

    // Add roll number separately
    const userIdsForProfileLookup = complaints.map((c) => c.userId?._id).filter(Boolean)
    let profileMap = {}
    if (userIdsForProfileLookup.length > 0) {
      const profiles = await StudentProfile.find({ userId: { $in: userIdsForProfileLookup } })
        .select("userId rollNumber")
        .lean()
      profileMap = profiles.reduce((map, p) => {
        map[p.userId.toString()] = p.rollNumber
        return map
      }, {})
    }

    const formattedComplaints = complaints.map((c) => ({
      ...c,
      complainant: {
        _id: c.userId?._id,
        name: c.userId?.name,
        email: c.userId?.email,
        rollNumber: c.userId?._id ? profileMap[c.userId._id.toString()] : null,
      },
      roomLocation: c.roomId?.unitId ? `${c.roomId.unitId.unitNumber}${c.roomId.roomNumber}` : c.roomId?.roomNumber,
      hostelName: c.hostelId?.name,
      assignedStaff: c.assignedTo ? { _id: c.assignedTo._id, name: c.assignedTo.name, email: c.assignedTo.email } : null,
      resolverStaff: c.resolvedBy ? { _id: c.resolvedBy._id, name: c.resolvedBy.name, email: c.resolvedBy.email } : null,
      // Remove redundant populated fields
      userId: undefined,
      hostelId: undefined,
      roomId: undefined,
      unitId: undefined,
      assignedTo: undefined,
      resolvedBy: undefined,
    }))

    res.json({
      complaints: formattedComplaints,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching complaints:", error)
    res.status(500)
    throw new Error("Server error during complaint search")
  }
})

export { searchComplaints }
