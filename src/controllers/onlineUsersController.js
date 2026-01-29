import { getOnlineUsers as getRedisOnlineUsers, getOnlineStats as getRedisOnlineStats, getUserOnlineData, isUserOnline } from "../../utils/redisOnlineUsers.js"
import Hostel from "../../models/Hostel.js"

/**
 * Get all currently online users
 * @route GET /api/online-users
 */
export const getOnlineUsers = async (req, res) => {
  try {
    const { role, hostelId, page = 1, limit = 50 } = req.query

    const filter = {}
    if (role) filter.role = role
    if (hostelId) filter.hostelId = hostelId

    // Get from Redis (FAST - in-memory)
    let users = await getRedisOnlineUsers(filter)

    // Pagination
    const total = users.length
    const skip = (parseInt(page) - 1) * parseInt(limit)
    users = users.slice(skip, skip + parseInt(limit))

    // Populate hostel names if needed
    if (users.length > 0) {
      const hostelIds = [...new Set(users.filter((u) => u.hostelId).map((u) => u.hostelId))]
      if (hostelIds.length > 0) {
        const hostels = await Hostel.find({ _id: { $in: hostelIds } }).select("name")
        const hostelMap = {}
        hostels.forEach((h) => {
          hostelMap[h._id.toString()] = h.name
        })

        users = users.map((u) => ({
          ...u,
          hostelName: u.hostelId ? hostelMap[u.hostelId.toString()] : null,
        }))
      }
    }

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    })
  } catch (error) {
    console.error("Error fetching online users:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch online users",
      error: error.message,
    })
  }
}

/**
 * Get online users statistics
 * @route GET /api/online-users/stats
 */
export const getOnlineStats = async (req, res) => {
  try {
    // Get from Redis (FAST - in-memory)
    const stats = await getRedisOnlineStats()

    res.status(200).json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error("Error fetching online stats:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch online statistics",
      error: error.message,
    })
  }
}

/**
 * Get online user details by userId
 * @route GET /api/online-users/:userId
 */
export const getOnlineUserByUserId = async (req, res) => {
  try {
    const { userId } = req.params

    // Get from Redis (FAST - in-memory)
    const userData = await getUserOnlineData(userId)

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: "User is not currently online",
      })
    }

    // Populate hostel name if hostelId exists
    if (userData.hostelId) {
      const hostel = await Hostel.findById(userData.hostelId).select("name")
      if (hostel) {
        userData.hostelName = hostel.name
      }
    }

    res.status(200).json({
      success: true,
      data: userData,
    })
  } catch (error) {
    console.error("Error fetching user online status:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch user online status",
      error: error.message,
    })
  }
}

export default {
  getOnlineUsers,
  getOnlineStats,
  getOnlineUserByUserId,
}
