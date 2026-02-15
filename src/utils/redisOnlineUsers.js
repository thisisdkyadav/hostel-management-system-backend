import { getRedisClients } from "../loaders/socket.loader.js"

/**
 * Redis helper functions for managing online users
 * Uses Redis for fast real-time state, MongoDB for historical logs
 */

const ONLINE_USERS_KEY = "online:users" // Hash: userId -> user data
const ONLINE_BY_ROLE_KEY = "online:by_role" // Hash: role -> count
const ONLINE_BY_HOSTEL_KEY = "online:by_hostel" // Hash: hostelId -> count
const USER_SOCKETS_PREFIX = "online:user:" // Set: userId -> [socketIds]
const SOCKET_USER_PREFIX = "online:socket:" // String: socketId -> userData
const USER_DATA_PREFIX = "online:userdata:" // String: userId -> full user data with TTL
const ONLINE_TTL = 90 // 90 seconds TTL - auto-cleanup stale connections (3x heartbeat interval)
const ALLOWED_USER_ROLES = new Set([
  "Student",
  "Maintenance Staff",
  "Warden",
  "Associate Warden",
  "Admin",
  "Security",
  "Super Admin",
  "Hostel Supervisor",
  "Hostel Gate",
  "Gymkhana",
])

/**
 * Get Redis client
 */
const getRedis = () => {
  const { pubClient } = getRedisClients()
  if (!pubClient) {
    throw new Error("Redis client not initialized")
  }
  return pubClient
}

/**
 * Normalize and validate online user payload from Redis.
 * Rejects non-user/system noise keys so online user APIs stay clean.
 * @param {Object} payload
 * @returns {Object|null}
 */
const normalizeOnlineUserPayload = (payload) => {
  if (!payload || typeof payload !== "object") return null

  const userId = payload.userId?.toString?.() ?? payload.userId
  const role = typeof payload.role === "string" ? payload.role.trim() : ""
  const hostelId = payload.hostelId?.toString?.() ?? payload.hostelId ?? null
  const userName = payload.userName?.toString?.() ?? payload.userName ?? ""
  const userEmail = payload.userEmail?.toString?.() ?? payload.userEmail ?? ""

  if (!userId || !role) return null
  if (userId.toLowerCase() === "system" || role.toLowerCase() === "system") return null
  if (!ALLOWED_USER_ROLES.has(role)) return null

  return {
    ...payload,
    userId,
    role,
    hostelId,
    userName,
    userEmail,
  }
}

/**
 * Build normalized online users array directly from Redis.
 * Returns invalid keys so callers can clean stale/bad cache entries.
 * @param {Object} redis
 * @returns {Promise<{users: Array, invalidKeys: Array}>}
 */
const getNormalizedUsersFromRedis = async (redis) => {
  const keys = await redis.keys(`${USER_DATA_PREFIX}*`)

  if (keys.length === 0) {
    return { users: [], invalidKeys: [] }
  }

  const values = await redis.mget(keys)
  const users = []
  const invalidKeys = []

  for (let i = 0; i < values.length; i++) {
    if (!values[i]) continue

    try {
      const parsed = JSON.parse(values[i])
      const user = normalizeOnlineUserPayload(parsed)

      if (!user) {
        invalidKeys.push(keys[i])
        continue
      }

      users.push(user)
    } catch (err) {
      console.error("Error parsing user data for normalized list:", err)
      invalidKeys.push(keys[i])
    }
  }

  return { users, invalidKeys }
}

/**
 * Add user to online users in Redis
 * @param {Object} userData - User data object
 * @returns {Promise<void>}
 */
export const addOnlineUser = async (userData) => {
  const redis = getRedis()
  const { userId, socketId, role, hostelId, userName, userEmail, connectedAt, deviceInfo } = userData

  try {
    const pipeline = redis.pipeline()
    const userIdStr = userId.toString()

    // Store socket -> user mapping (with TTL for auto-cleanup)
    pipeline.set(`${SOCKET_USER_PREFIX}${socketId}`, JSON.stringify({ userId, role, hostelId, userName, userEmail, connectedAt, deviceInfo }), "EX", ONLINE_TTL)

    // Add socket to user's socket set (with TTL)
    pipeline.sadd(`${USER_SOCKETS_PREFIX}${userIdStr}`, socketId)
    pipeline.expire(`${USER_SOCKETS_PREFIX}${userIdStr}`, ONLINE_TTL)

    // Check if user is already online
    const isOnline = await redis.exists(`${USER_DATA_PREFIX}${userIdStr}`)

    // Store user data with TTL (refreshed on each connection/activity)
    const userPayload = JSON.stringify({
      userId,
      userName,
      userEmail,
      role,
      hostelId,
      connectedAt,
      lastActivity: new Date().toISOString(),
    })
    pipeline.set(`${USER_DATA_PREFIX}${userIdStr}`, userPayload, "EX", ONLINE_TTL)

    // Update counts only if user was not already online
    if (!isOnline) {
      pipeline.hincrby(ONLINE_BY_ROLE_KEY, role, 1)
      if (hostelId) {
        pipeline.hincrby(ONLINE_BY_HOSTEL_KEY, hostelId.toString(), 1)
      }
    }

    await pipeline.exec()

    console.log(`✓ Redis: User ${userName} (${userId}) added to online users`)
  } catch (error) {
    console.error("Error adding online user to Redis:", error)
    throw error
  }
}

/**
 * Remove user from online users in Redis
 * @param {String} socketId - Socket ID
 * @returns {Promise<Object>} - Removed user data
 */
export const removeOnlineUser = async (socketId) => {
  const redis = getRedis()

  try {
    // Get user data from socket
    const userDataStr = await redis.get(`${SOCKET_USER_PREFIX}${socketId}`)
    if (!userDataStr) {
      console.warn(`Socket ${socketId} not found in Redis`)
      return null
    }

    const userData = JSON.parse(userDataStr)
    const { userId, role, hostelId } = userData
    const userIdStr = userId.toString()

    const pipeline = redis.pipeline()

    // Remove socket from user's socket set
    pipeline.srem(`${USER_SOCKETS_PREFIX}${userIdStr}`, socketId)

    // Check if user has other sockets
    const remainingSockets = await redis.scard(`${USER_SOCKETS_PREFIX}${userIdStr}`)

    if (remainingSockets <= 1) {
      // No more sockets, user is fully offline
      pipeline.del(`${USER_DATA_PREFIX}${userIdStr}`)
      pipeline.del(`${USER_SOCKETS_PREFIX}${userIdStr}`)

      // Decrement counts with safety check (ensure we don't go below 0)
      const currentRoleCount = await redis.hget(ONLINE_BY_ROLE_KEY, role)
      if (currentRoleCount && parseInt(currentRoleCount) > 0) {
        pipeline.hincrby(ONLINE_BY_ROLE_KEY, role, -1)
      } else {
        // Reset to 0 if somehow it's negative
        pipeline.hset(ONLINE_BY_ROLE_KEY, role, 0)
      }

      if (hostelId) {
        const currentHostelCount = await redis.hget(ONLINE_BY_HOSTEL_KEY, hostelId.toString())
        if (currentHostelCount && parseInt(currentHostelCount) > 0) {
          pipeline.hincrby(ONLINE_BY_HOSTEL_KEY, hostelId.toString(), -1)
        } else {
          // Reset to 0 if somehow it's negative
          pipeline.hset(ONLINE_BY_HOSTEL_KEY, hostelId.toString(), 0)
        }
      }

      console.log(`✓ Redis: User ${userId} fully offline`)
    } else {
      console.log(`✓ Redis: Socket ${socketId} removed, user ${userId} still has ${remainingSockets - 1} connections`)
    }

    // Remove socket mapping
    pipeline.del(`${SOCKET_USER_PREFIX}${socketId}`)

    await pipeline.exec()

    return userData
  } catch (error) {
    console.error("Error removing online user from Redis:", error)
    throw error
  }
}

/**
 * Update user activity timestamp
 * @param {String} userId - User ID
 * @returns {Promise<void>}
 */
export const updateUserActivity = async (userId) => {
  const redis = getRedis()

  try {
    const userIdStr = userId.toString()

    // Get existing user data
    const userDataStr = await redis.get(`${USER_DATA_PREFIX}${userIdStr}`)
    if (!userDataStr) {
      console.warn(`User ${userId} not found in online users`)
      return
    }

    const userData = JSON.parse(userDataStr)
    userData.lastActivity = new Date().toISOString()

    // Update with new TTL (refresh TTL on activity)
    await redis.set(`${USER_DATA_PREFIX}${userIdStr}`, JSON.stringify(userData), "EX", ONLINE_TTL)

    // Also refresh socket set TTL
    await redis.expire(`${USER_SOCKETS_PREFIX}${userIdStr}`, ONLINE_TTL)
  } catch (error) {
    console.error("Error updating user activity:", error)
  }
}

/**
 * Get all online users
 * @param {Object} filter - Filter options { role, hostelId }
 * @returns {Promise<Array>} - Array of online users
 */
export const getOnlineUsers = async (filter = {}) => {
  const redis = getRedis()

  try {
    const { users: normalizedUsers, invalidKeys } = await getNormalizedUsersFromRedis(redis)

    if (invalidKeys.length > 0) {
      await redis.del(...invalidKeys)
      console.warn(`Removed ${invalidKeys.length} invalid online user cache entries`)
    }

    return normalizedUsers.filter((user) => {
      if (filter.role && user.role !== filter.role) return false
      if (filter.hostelId && user.hostelId?.toString() !== filter.hostelId.toString()) return false
      return true
    })
  } catch (error) {
    console.error("Error getting online users from Redis:", error)
    throw error
  }
}

/**
 * Get online users statistics
 * Recalculates from actual data to ensure accuracy
 * @returns {Promise<Object>} - Statistics object
 */
export const getOnlineStats = async () => {
  const redis = getRedis()

  try {
    const { users, invalidKeys } = await getNormalizedUsersFromRedis(redis)

    if (invalidKeys.length > 0) {
      await redis.del(...invalidKeys)
      console.warn(`Removed ${invalidKeys.length} invalid online user cache entries while building stats`)
    }

    if (users.length === 0) {
      return {
        totalOnline: 0,
        byRole: {},
        byHostel: [],
      }
    }

    const roleStats = {}
    const hostelStats = {}
    let totalOnline = 0

    for (const user of users) {
      totalOnline++

      // Count by role
      roleStats[user.role] = (roleStats[user.role] || 0) + 1

      // Count by hostel
      if (user.hostelId) {
        const hostelIdStr = user.hostelId.toString()
        hostelStats[hostelIdStr] = (hostelStats[hostelIdStr] || 0) + 1
      }
    }

    // Format hostel stats as array
    const hostelStatsArray = Object.entries(hostelStats).map(([hostelId, count]) => ({
      hostelId,
      count,
    }))

    // Update stored counts in Redis (sync them with actual data)
    const pipeline = redis.pipeline()

    // Clear and reset role counts
    pipeline.del(ONLINE_BY_ROLE_KEY)
    for (const [role, count] of Object.entries(roleStats)) {
      pipeline.hset(ONLINE_BY_ROLE_KEY, role, count)
    }

    // Clear and reset hostel counts
    pipeline.del(ONLINE_BY_HOSTEL_KEY)
    for (const [hostelId, count] of Object.entries(hostelStats)) {
      pipeline.hset(ONLINE_BY_HOSTEL_KEY, hostelId, count)
    }

    await pipeline.exec()

    return {
      totalOnline,
      byRole: roleStats,
      byHostel: hostelStatsArray,
    }
  } catch (error) {
    console.error("Error getting online stats from Redis:", error)
    throw error
  }
}

/**
 * Check if user is online
 * @param {String} userId - User ID
 * @returns {Promise<Boolean>}
 */
export const isUserOnline = async (userId) => {
  const redis = getRedis()

  try {
    const exists = await redis.exists(`${USER_DATA_PREFIX}${userId.toString()}`)
    return exists === 1
  } catch (error) {
    console.error("Error checking user online status:", error)
    return false
  }
}

/**
 * Get user's online data
 * @param {String} userId - User ID
 * @returns {Promise<Object|null>}
 */
export const getUserOnlineData = async (userId) => {
  const redis = getRedis()

  try {
    const userIdStr = userId.toString()
    const userDataStr = await redis.get(`${USER_DATA_PREFIX}${userIdStr}`)
    if (!userDataStr) return null

    const userData = JSON.parse(userDataStr)

    // Get socket count
    const socketCount = await redis.scard(`${USER_SOCKETS_PREFIX}${userId}`)
    userData.socketCount = socketCount || 0

    return userData
  } catch (error) {
    console.error("Error getting user online data:", error)
    return null
  }
}

/**
 * Clear all online users (for testing/cleanup)
 * @returns {Promise<void>}
 */
export const clearAllOnlineUsers = async () => {
  const redis = getRedis()

  try {
    const [userDataKeys, socketKeys, userSocketKeys] = await Promise.all([
      redis.keys(`${USER_DATA_PREFIX}*`),
      redis.keys(`${SOCKET_USER_PREFIX}*`),
      redis.keys(`${USER_SOCKETS_PREFIX}*`),
    ])

    const keysToDelete = [
      ONLINE_USERS_KEY,
      ONLINE_BY_ROLE_KEY,
      ONLINE_BY_HOSTEL_KEY,
      ...userDataKeys,
      ...socketKeys,
      ...userSocketKeys,
    ]

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete)
    }

    console.log("✓ Redis: All online users cleared")
  } catch (error) {
    console.error("Error clearing online users:", error)
  }
}

export default {
  addOnlineUser,
  removeOnlineUser,
  updateUserActivity,
  getOnlineUsers,
  getOnlineStats,
  isUserOnline,
  getUserOnlineData,
  clearAllOnlineUsers,
}
