import Notification from "../../models/Notification.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchNotifications = asyncHandler(async (req, res) => {
  const {
    keyword, // General keyword for title/message
    type,
    senderName,
    senderEmail,
    hostelName,
    degree,
    department,
    gender,
    startDate, // ISO Date string
    endDate, // ISO Date string
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const userQuery = {}
  const hostelQuery = {}

  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }, { message: { $regex: keyword, $options: "i" } }]
  }

  if (type) {
    query.type = type
  }

  if (degree) {
    // Handle array of degrees
    const degrees = Array.isArray(degree) ? degree : [degree]
    query.degree = {
      $in: degrees.map((d) => new RegExp(d, "i")),
    }
  }

  if (department) {
    // Handle array of departments
    const departments = Array.isArray(department) ? department : [department]
    query.department = {
      $in: departments.map((d) => new RegExp(d, "i")),
    }
  }

  if (gender) {
    query.gender = gender
  }

  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) {
      query.createdAt.$gte = new Date(startDate)
    }
    if (endDate) {
      // Adjust endDate to include the whole day
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.createdAt.$lte = endOfDay
    }
  }

  // --- Handle Referenced Fields ---

  // Sender Search
  if (senderName) {
    userQuery.name = { $regex: senderName, $options: "i" }
  }
  if (senderEmail) {
    userQuery.email = { $regex: senderEmail, $options: "i" }
  }

  if (Object.keys(userQuery).length > 0) {
    try {
      const senders = await User.find(userQuery).select("_id").lean()
      if (senders.length > 0) {
        query.sender = { $in: senders.map((s) => s._id) }
      } else {
        // If no matching senders found, no notifications will match
        return res.json({
          notifications: [],
          page: 1,
          pages: 0,
          total: 0,
        })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for senders")
    }
  }

  // Hostel Search
  if (hostelName) {
    const hostelNames = Array.isArray(hostelName) ? hostelName : [hostelName]
    hostelQuery.$or = hostelNames.map((name) => ({
      name: { $regex: name, $options: "i" },
    }))
  }

  if (Object.keys(hostelQuery).length > 0) {
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        // Match any of the found hostel IDs
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        // If no matching hostels found, no notifications will match
        return res.json({
          notifications: [],
          page: 1,
          pages: 0,
          total: 0,
        })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  // --- Execution ---
  try {
    const count = await Notification.countDocuments(query)
    const notifications = await Notification.find(query)
      .populate("sender", "name email") // Populate sender details
      .populate("hostelId", "name") // Populate hostel details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 }) // Sort by creation date descending
      .lean()

    res.json({
      notifications,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching notifications:", error)
    res.status(500)
    throw new Error("Server error during notification search")
  }
})

export { searchNotifications }
