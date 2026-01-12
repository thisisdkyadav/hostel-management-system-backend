import CheckInOut from "../models/CheckInOut.js"
import Hostel from "../models/Hostel.js"

/**
 * Service for Live Check-In/Out operations
 * Handles all business logic for real-time check-in/out monitoring
 */

/**
 * Get live check-in/out entries with advanced filters
 * @param {Object} filters - Filter parameters
 * @returns {Object} Entries, pagination, and stats
 */
export const getLiveEntries = async (filters = {}) => {
  const { status, startDate, endDate, hostelId, isSameHostel, search, page = 1, limit = 20, sortBy = "dateAndTime", sortOrder = "desc" } = filters

  // Build query
  const query = {}

  // Filter by status
  if (status) {
    query.status = status
  }

  // Filter by date range
  if (startDate || endDate) {
    query.dateAndTime = {}
    if (startDate) {
      query.dateAndTime.$gte = new Date(startDate)
    }
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      query.dateAndTime.$lte = endDateTime
    }
  }

  // Filter by hostel
  if (hostelId) {
    query.hostelId = hostelId
  }

  // Filter by same hostel or cross-hostel
  if (isSameHostel !== undefined) {
    query.isSameHostel = isSameHostel === "true"
  }

  // Search across multiple fields
  if (search) {
    const searchRegex = { $regex: search, $options: "i" }
    query.$or = [{ hostelName: searchRegex }, { room: searchRegex }, { unit: searchRegex }, { bed: searchRegex }, { reason: searchRegex }]
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit)
  const sortOptions = { [sortBy]: sortOrder === "asc" ? 1 : -1 }

  // Execute query with population
  const [entries, totalCount] = await Promise.all([CheckInOut.find(query).sort(sortOptions).skip(skip).limit(parseInt(limit)).populate("userId", "name email phone profileImage").populate("hostelId", "name type").lean().exec(), CheckInOut.countDocuments(query)])

  // Calculate stats
  const stats = await calculateCheckInOutStats(query)

  return {
    entries,
    pagination: {
      total: totalCount,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(totalCount / parseInt(limit)),
    },
    stats,
  }
}

/**
 * Calculate check-in/out statistics
 * @param {Object} baseQuery - Base query to filter stats
 * @returns {Object} Statistics object
 */
export const calculateCheckInOutStats = async (baseQuery = {}) => {
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayQuery = { ...baseQuery, dateAndTime: { $gte: today } }

    const [totalCheckedIn, totalCheckedOut, todayCheckedIn, todayCheckedOut, crossHostelToday, sameHostelToday] = await Promise.all([
      CheckInOut.countDocuments({ ...baseQuery, status: "Checked In" }),
      CheckInOut.countDocuments({ ...baseQuery, status: "Checked Out" }),
      CheckInOut.countDocuments({ ...todayQuery, status: "Checked In" }),
      CheckInOut.countDocuments({ ...todayQuery, status: "Checked Out" }),
      CheckInOut.countDocuments({ ...todayQuery, isSameHostel: false }),
      CheckInOut.countDocuments({ ...todayQuery, isSameHostel: true }),
    ])

    return {
      total: {
        checkedIn: totalCheckedIn,
        checkedOut: totalCheckedOut,
      },
      today: {
        checkedIn: todayCheckedIn,
        checkedOut: todayCheckedOut,
        crossHostel: crossHostelToday,
        sameHostel: sameHostelToday,
        total: todayCheckedIn + todayCheckedOut,
      },
    }
  } catch (error) {
    console.error("Error calculating stats:", error)
    return {
      total: { checkedIn: 0, checkedOut: 0 },
      today: { checkedIn: 0, checkedOut: 0, crossHostel: 0, sameHostel: 0, total: 0 },
    }
  }
}

/**
 * Get hostel-wise check-in/out statistics
 * @returns {Array} Hostel-wise statistics
 */
export const getHostelWiseStats = async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Aggregate by hostel
  const hostelStats = await CheckInOut.aggregate([
    {
      $match: {
        dateAndTime: { $gte: today },
      },
    },
    {
      $group: {
        _id: "$hostelId",
        checkedIn: {
          $sum: { $cond: [{ $eq: ["$status", "Checked In"] }, 1, 0] },
        },
        checkedOut: {
          $sum: { $cond: [{ $eq: ["$status", "Checked Out"] }, 1, 0] },
        },
        crossHostel: {
          $sum: { $cond: [{ $eq: ["$isSameHostel", false] }, 1, 0] },
        },
      },
    },
    {
      $lookup: {
        from: "hostels",
        localField: "_id",
        foreignField: "_id",
        as: "hostelInfo",
      },
    },
    {
      $unwind: "$hostelInfo",
    },
    {
      $project: {
        hostelId: "$_id",
        hostelName: "$hostelInfo.name",
        hostelType: "$hostelInfo.type",
        checkedIn: 1,
        checkedOut: 1,
        crossHostel: 1,
        total: { $add: ["$checkedIn", "$checkedOut"] },
      },
    },
    {
      $sort: { total: -1 },
    },
  ])

  return hostelStats
}

/**
 * Get recent activity timeline
 * @param {Number} limit - Number of entries to fetch
 * @returns {Array} Recent entries
 */
export const getRecentActivity = async (limit = 50) => {
  const recentEntries = await CheckInOut.find().sort({ dateAndTime: -1 }).limit(parseInt(limit)).populate("userId", "name email phone profileImage").populate("hostelId", "name type").lean().exec()

  return recentEntries
}

/**
 * Get time-based analytics (hourly distribution)
 * @param {Date} targetDate - Date to analyze
 * @returns {Array} Hourly statistics
 */
export const getTimeBasedAnalytics = async (targetDate = null) => {
  const date = targetDate ? new Date(targetDate) : new Date()
  date.setHours(0, 0, 0, 0)

  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)

  const hourlyStats = await CheckInOut.aggregate([
    {
      $match: {
        dateAndTime: {
          $gte: date,
          $lt: nextDay,
        },
      },
    },
    {
      $project: {
        hour: { $hour: "$dateAndTime" },
        status: 1,
      },
    },
    {
      $group: {
        _id: "$hour",
        checkedIn: {
          $sum: { $cond: [{ $eq: ["$status", "Checked In"] }, 1, 0] },
        },
        checkedOut: {
          $sum: { $cond: [{ $eq: ["$status", "Checked Out"] }, 1, 0] },
        },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ])

  // Fill in missing hours with zeros
  const completeHourlyData = Array.from({ length: 24 }, (_, hour) => {
    const existing = hourlyStats.find((stat) => stat._id === hour)
    return {
      hour,
      checkedIn: existing?.checkedIn || 0,
      checkedOut: existing?.checkedOut || 0,
      total: (existing?.checkedIn || 0) + (existing?.checkedOut || 0),
    }
  })

  return {
    data: completeHourlyData,
    date: date,
  }
}

/**
 * Emit Socket.IO event for new check-in/out entry
 * @param {Object} io - Socket.IO instance
 * @param {Object} entry - Check-in/out entry
 */
export const emitNewEntryEvent = async (io, entry) => {
  if (!io) return

  // Populate entry details if not already populated
  if (!entry.userId?.name) {
    await entry.populate("userId", "name email phone profileImage")
  }
  if (!entry.hostelId?.name) {
    await entry.populate("hostelId", "name type")
  }

  // Emit to admin rooms
  io.to("role:Admin").to("role:Super Admin").emit("checkinout:new", {
    entry,
    timestamp: new Date(),
  })

  // Emit to hostel gate users at the specific hostel
  const hostelId = entry.hostelId?._id || entry.hostelId
  if (hostelId) {
    io.to(`hostel:${hostelId}`).emit("gateentry:new", {
      entry,
      timestamp: new Date(),
    })
    console.log(`📡 Emitted gate entry event to hostel:${hostelId}`)
  }

  console.log(`📡 Emitted new check-in/out event: ${entry.userId?.name} - ${entry.status}`)
}

export default {
  getLiveEntries,
  calculateCheckInOutStats,
  getHostelWiseStats,
  getRecentActivity,
  getTimeBasedAnalytics,
  emitNewEntryEvent,
}
