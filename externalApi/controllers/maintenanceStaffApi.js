import MaintenanceStaff from "../../models/MaintenanceStaff.js"
import User from "../../models/User.js"
import asyncHandler from "express-async-handler"

const searchMaintenanceStaff = asyncHandler(async (req, res) => {
  const { userName, userEmail, category, page = 1, limit = 10 } = req.query

  const query = {}
  const userQuery = {}

  // --- Build Queries for Referenced Models ---

  // User Search
  if (userName) {
    userQuery.name = { $regex: userName, $options: "i" }
  }
  if (userEmail) {
    userQuery.email = { $regex: userEmail, $options: "i" }
  }
  // Ensure we only search for users with the 'Maintenance Staff' role
  userQuery.role = "Maintenance Staff"

  if (userName || userEmail) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ staff: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  } else {
    // If no user criteria, find all maintenance staff users first
    try {
      const users = await User.find({ role: "Maintenance Staff" }).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        // No users with Maintenance Staff role exist
        return res.json({ staff: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding maintenance staff users:", error)
      res.status(500)
      throw new Error("Error finding maintenance staff users")
    }
  }

  // --- Build Main Query ---

  if (category) {
    query.category = category
  }

  // --- Execution ---
  try {
    const count = await MaintenanceStaff.countDocuments(query)
    const staff = await MaintenanceStaff.find(query)
      .populate("userId", "name email phone") // Populate user details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userId.name": 1 }) // Sort by name
      .lean()

    res.json({
      staff,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching maintenance staff:", error)
    res.status(500)
    throw new Error("Server error during maintenance staff search")
  }
})

export { searchMaintenanceStaff }
