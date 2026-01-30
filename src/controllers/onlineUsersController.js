import { onlineUsersService } from "../services/onlineUsers.service.js"
import { asyncHandler } from "../utils/index.js"

/**
 * Get all currently online users
 * @route GET /api/online-users
 */
export const getOnlineUsers = asyncHandler(async (req, res) => {
  const result = await onlineUsersService.getOnlineUsers(req.query)
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json({
    success: true,
    data: result.data.data,
    pagination: result.data.pagination,
  })
})

/**
 * Get online users statistics
 * @route GET /api/online-users/stats
 */
export const getOnlineStats = asyncHandler(async (req, res) => {
  const result = await onlineUsersService.getOnlineStats()
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json({
    success: true,
    data: result.data,
  })
})

/**
 * Get online user details by userId
 * @route GET /api/online-users/:userId
 */
export const getOnlineUserByUserId = asyncHandler(async (req, res) => {
  const result = await onlineUsersService.getOnlineUserByUserId(req.params.userId)
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    })
  }
  res.status(result.statusCode).json({
    success: true,
    data: result.data,
  })
})

export default {
  getOnlineUsers,
  getOnlineStats,
  getOnlineUserByUserId,
}
