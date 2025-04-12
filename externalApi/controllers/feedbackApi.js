import Feedback from "../../models/Feedback.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchFeedback = asyncHandler(async (req, res) => {
  const {
    userName,
    userEmail,
    hostelName,
    keyword, // Search in title and description
    status,
    isReplied, // boolean: true if reply is not null
    startDate, // ISO Date string for createdAt
    endDate,
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const userQuery = {}
  const hostelQuery = {}

  // --- Build Queries for Referenced Models ---

  // User Search
  if (userName) {
    userQuery.name = { $regex: userName, $options: "i" }
  }
  if (userEmail) {
    userQuery.email = { $regex: userEmail, $options: "i" }
  }

  if (Object.keys(userQuery).length > 0) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ feedback: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  }

  // Hostel Search
  if (hostelName) {
    hostelQuery.name = { $regex: hostelName, $options: "i" }
  }

  if (Object.keys(hostelQuery).length > 0) {
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        return res.json({ feedback: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  // --- Build Main Query ---

  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }, { description: { $regex: keyword, $options: "i" } }]
  }

  if (status) {
    query.status = status
  }

  if (isReplied === "true") {
    query.reply = { $ne: null, $ne: "" }
  }
  if (isReplied === "false") {
    query.reply = { $in: [null, ""] }
  }

  if (startDate || endDate) {
    query.createdAt = {}
    if (startDate) {
      query.createdAt.$gte = new Date(startDate)
    }
    if (endDate) {
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.createdAt.$lte = endOfDay
    }
  }

  // --- Execution ---
  try {
    const count = await Feedback.countDocuments(query)
    const feedback = await Feedback.find(query)
      .populate("userId", "name email") // Populate user details
      .populate("hostelId", "name") // Populate hostel details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 }) // Sort by creation date descending
      .lean()

    res.json({
      feedback,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching feedback:", error)
    res.status(500)
    throw new Error("Server error during feedback search")
  }
})

export { searchFeedback }
