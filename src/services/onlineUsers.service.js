import { getOnlineUsers as getRedisOnlineUsers, getOnlineStats as getRedisOnlineStats, getUserOnlineData, isUserOnline } from "../../utils/redisOnlineUsers.js"
import Hostel from "../../models/Hostel.js"

class OnlineUsersService {
  async getOnlineUsers(query) {
    try {
      const { role, hostelId, page = 1, limit = 50 } = query

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

      return {
        success: true,
        statusCode: 200,
        data: {
          data: users,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / parseInt(limit)),
          },
        },
      }
    } catch (error) {
      console.error("Error fetching online users:", error)
      return { success: false, statusCode: 500, message: "Failed to fetch online users", error: error.message }
    }
  }

  async getOnlineStats() {
    try {
      // Get from Redis (FAST - in-memory)
      const stats = await getRedisOnlineStats()

      return { success: true, statusCode: 200, data: stats }
    } catch (error) {
      console.error("Error fetching online stats:", error)
      return { success: false, statusCode: 500, message: "Failed to fetch online statistics", error: error.message }
    }
  }

  async getOnlineUserByUserId(userId) {
    try {
      // Get from Redis (FAST - in-memory)
      const userData = await getUserOnlineData(userId)

      if (!userData) {
        return { success: false, statusCode: 404, message: "User is not currently online" }
      }

      // Populate hostel name if hostelId exists
      if (userData.hostelId) {
        const hostel = await Hostel.findById(userData.hostelId).select("name")
        if (hostel) {
          userData.hostelName = hostel.name
        }
      }

      return { success: true, statusCode: 200, data: userData }
    } catch (error) {
      console.error("Error fetching user online status:", error)
      return { success: false, statusCode: 500, message: "Failed to fetch user online status", error: error.message }
    }
  }
}

export const onlineUsersService = new OnlineUsersService()
