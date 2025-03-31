import Notification from "../models/Notification.js"

export const createNotification = async (req, res) => {
  const { title, message, type, targetType, status, expiryDate } = req.body
  const sender = req.user._id

  try {
    const notification = new Notification({
      title,
      message,
      type,
      sender,
      targetType,
      status,
      expiryDate,
    })

    await notification.save()

    res.status(201).json({ message: "Notification created successfully", notification })
  } catch (error) {
    console.error("Error creating notification:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getNotifications = async (req, res) => {
  const { page, limit, status, type, targetType, search, expiryStatus } = req.query

  try {
    const query = {}
    if (status) query.status = status
    if (type) query.type = type
    if (targetType) query.targetType = targetType
    if (expiryStatus) {
      const now = new Date()
      if (expiryStatus === "active") {
        query.expiryDate = { $gte: now }
      } else if (expiryStatus === "expired") {
        query.expiryDate = { $lt: now }
      }
    }
    if (search) {
      const regex = new RegExp(search, "i")
      query.$or = [{ title: regex }, { message: regex }, { type: regex }, { targetType: regex }, { status: regex }]
    }

    const pageInt = parseInt(page) || 1
    const limitInt = parseInt(limit) || 10
    const skip = (pageInt - 1) * limitInt

    const notifications = await Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitInt).populate("sender", "name email")

    const totalNotifications = await Notification.countDocuments(query)
    const totalPages = Math.ceil(totalNotifications / limitInt)

    res.status(200).json({
      data: notifications,
      meta: { totalCount: totalNotifications, totalPages, currentPage: pageInt },
    })
  } catch (error) {
    console.error("Error fetching notifications:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getNotificationStats = async (req, res) => {
  try {
    const now = new Date()

    const total = await Notification.countDocuments()
    const active = await Notification.countDocuments({ expiryDate: { $gte: now } })
    const expired = await Notification.countDocuments({ expiryDate: { $lt: now } })

    res.status(200).json({ data: { total, active, expired } })
  } catch (error) {
    console.error("Error fetching notification stats:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
