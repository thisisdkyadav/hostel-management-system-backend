import Notification from "../models/Notification.js"
import StudentProfile from "../models/StudentProfile.js"

export const createNotification = async (req, res) => {
  const { title, message, type, hostelId, degree, department, gender, expiryDate } = req.body
  const sender = req.user._id

  try {
    const notification = new Notification({
      title,
      message,
      type,
      sender,
      hostelId,
      degree,
      department,
      gender,
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
  const { page, limit, type, hostelId, degree, department, gender, search, expiryStatus } = req.query
  const user = req.user

  try {
    const query = {}
    if (type) query.type = type
    if (user.role === "Student") {
      const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate("currentRoomAllocation", "hostelId")
      const hostelId = studentProfile.currentRoomAllocation?.hostelId
      const { gender, degree, department } = studentProfile
      query.$and = [{ $or: [{ gender: null }, { gender: gender }] }, { $or: [{ hostelId: null }, { hostelId: hostelId }] }, { $or: [{ degree: null }, { degree: degree }] }, { $or: [{ department: null }, { department: department }] }]
    } else {
      if (hostelId) query.hostelId = hostelId
      if (degree) query.degree = degree
      if (department) query.department = department
      if (gender) query.gender = gender
    }
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
      query.$or = [{ title: regex }, { message: regex }, { sender: regex }, { hostelId: regex }, { degree: regex }, { department: regex }]
    }

    const pageInt = parseInt(page) || 1
    const limitInt = parseInt(limit) || 10
    const skip = (pageInt - 1) * limitInt

    const notifications = await Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitInt).populate("sender", "name email").populate("hostelId", "name")

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
  const user = req.user
  try {
    let query = {}
    if (user.role === "Student") {
      const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate("currentRoomAllocation", "hostelId")
      const hostelId = studentProfile.currentRoomAllocation?.hostelId
      const { gender, degree, department } = studentProfile
      query = {
        $and: [{ $or: [{ gender: null }, { gender: gender }] }, { $or: [{ hostelId: null }, { hostelId: hostelId }] }, { $or: [{ degree: null }, { degree: degree }] }, { $or: [{ department: null }, { department: department }] }],
      }
    }

    const now = new Date()
    const total = await Notification.countDocuments(query)
    const active = await Notification.countDocuments({ ...query, expiryDate: { $gte: now } })
    const expired = await Notification.countDocuments({ ...query, expiryDate: { $lt: now } })

    res.status(200).json({ data: { total, active, expired } })
  } catch (error) {
    console.error("Error fetching notification stats:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}

export const getActiveNotificationsCount = async (req, res) => {
  const user = req.user
  try {
    const now = new Date()
    let query = {}
    if (user.role === "Student") {
      const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate("currentRoomAllocation", "hostelId")
      const hostelId = studentProfile.currentRoomAllocation?.hostelId
      const { gender, degree, department } = studentProfile
      query = {
        $and: [{ $or: [{ gender: null }, { gender: gender }] }, { $or: [{ hostelId: null }, { hostelId: hostelId }] }, { $or: [{ degree: null }, { degree: degree }] }, { $or: [{ department: null }, { department: department }] }],
      }
    }

    const activeCount = await Notification.countDocuments({ ...query, expiryDate: { $gte: now } })

    res.status(200).json({ activeCount })
  } catch (error) {
    console.error("Error fetching active notifications count:", error)
    res.status(500).json({ error: "Internal server error" })
  }
}
