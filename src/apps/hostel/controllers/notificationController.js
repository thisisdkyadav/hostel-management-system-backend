import { notificationService } from "../services/notification.service.js"
import { asyncHandler } from "../../../utils/index.js"

// Helper: Error format { error }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const createNotification = asyncHandler(async (req, res) => {
  const result = await notificationService.create(req.body, req.user._id)
  sendResponse(res, result)
})

export const getNotifications = asyncHandler(async (req, res) => {
  const result = await notificationService.getAll(req.query, req.user)
  sendResponse(res, result)
})

export const getNotificationStats = asyncHandler(async (req, res) => {
  const result = await notificationService.getStats(req.user)
  sendResponse(res, result)
})

export const getActiveNotificationsCount = asyncHandler(async (req, res) => {
  const result = await notificationService.getActiveCount(req.user)
  sendResponse(res, result)
})
