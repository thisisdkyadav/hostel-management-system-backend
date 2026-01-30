import { notificationService } from "../services/notification.service.js"

export const createNotification = async (req, res) => {
  const result = await notificationService.create(req.body, req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getNotifications = async (req, res) => {
  const result = await notificationService.getAll(req.query, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getNotificationStats = async (req, res) => {
  const result = await notificationService.getStats(req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getActiveNotificationsCount = async (req, res) => {
  const result = await notificationService.getActiveCount(req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message })
  }
  res.status(result.statusCode).json(result.data)
}
