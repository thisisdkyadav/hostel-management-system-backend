/**
 * Online Users Service
 * Handles online user tracking via Redis
 * 
 * @module services/onlineUsers.service
 */

import { getOnlineUsers as getRedisOnlineUsers, getOnlineStats as getRedisOnlineStats, getUserOnlineData } from '../../../utils/redisOnlineUsers.js';
import { Hostel } from '../../../models/index.js';
import { success, notFound, error } from '../../../services/base/index.js';

class OnlineUsersService {
  /**
   * Get online users with pagination
   * @param {Object} query - Query params (role, hostelId, page, limit)
   */
  async getOnlineUsers(query) {
    try {
      const { role, hostelId, page = 1, limit = 50 } = query;

      const filter = {};
      if (role) filter.role = role;
      if (hostelId) filter.hostelId = hostelId;

      // Get from Redis
      let users = await getRedisOnlineUsers(filter);

      // Pagination
      const total = users.length;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      users = users.slice(skip, skip + parseInt(limit));

      // Populate hostel names
      if (users.length > 0) {
        const hostelIds = [...new Set(users.filter((u) => u.hostelId).map((u) => u.hostelId))];
        if (hostelIds.length > 0) {
          const hostels = await Hostel.find({ _id: { $in: hostelIds } }).select('name');
          const hostelMap = {};
          hostels.forEach((h) => {
            hostelMap[h._id.toString()] = h.name;
          });

          users = users.map((u) => ({
            ...u,
            hostelName: u.hostelId ? hostelMap[u.hostelId.toString()] : null
          }));
        }
      }

      return success({
        data: users,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (err) {
      return error('Failed to fetch online users', 500, err.message);
    }
  }

  /**
   * Get online statistics
   */
  async getOnlineStats() {
    try {
      const stats = await getRedisOnlineStats();
      return success(stats);
    } catch (err) {
      return error('Failed to fetch online statistics', 500, err.message);
    }
  }

  /**
   * Get online status for a specific user
   * @param {string} userId - User ID
   */
  async getOnlineUserByUserId(userId) {
    try {
      const userData = await getUserOnlineData(userId);

      if (!userData) {
        return notFound('User is not currently online');
      }

      // Populate hostel name
      if (userData.hostelId) {
        const hostel = await Hostel.findById(userData.hostelId).select('name');
        if (hostel) {
          userData.hostelName = hostel.name;
        }
      }

      return success(userData);
    } catch (err) {
      return error('Failed to fetch user online status', 500, err.message);
    }
  }
}

export const onlineUsersService = new OnlineUsersService();
