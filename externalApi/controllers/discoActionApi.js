import DisCoAction from "../../models/DisCoAction.js"
import User from "../../models/User.js"
import asyncHandler from "express-async-handler"

const searchDisCoActions = asyncHandler(async (req, res) => {
  const {
    userName,
    userEmail,
    reason,
    actionTaken,
    startDate, // ISO Date string
    endDate, // ISO Date string
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const userQuery = {}

  if (reason) {
    query.reason = { $regex: reason, $options: "i" }
  }

  if (actionTaken) {
    query.actionTaken = { $regex: actionTaken, $options: "i" }
  }

  if (startDate || endDate) {
    query.date = {}
    if (startDate) {
      query.date.$gte = new Date(startDate)
    }
    if (endDate) {
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.date.$lte = endOfDay
    }
  }

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
        return res.json({ actions: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  }

  // --- Execution ---
  try {
    const count = await DisCoAction.countDocuments(query)
    const actions = await DisCoAction.find(query)
      .populate("userId", "name email rollNumber") // Populate user details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: -1 }) // Sort by date descending
      .lean()

    res.json({
      actions,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching DisCo actions:", error)
    res.status(500)
    throw new Error("Server error during DisCo action search")
  }
})

export { searchDisCoActions }
