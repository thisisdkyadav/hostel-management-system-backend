import Security from "../../models/Security.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchSecurity = asyncHandler(async (req, res) => {
  const { userName, userEmail, hostelName, page = 1, limit = 10 } = req.query

  const query = {}
  const userQuery = {}
  let hostelId = null

  // --- Build Queries for Referenced Models ---

  // Hostel Search
  if (hostelName) {
    try {
      const hostel = await Hostel.findOne({ name: { $regex: `^${hostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (hostel) {
        hostelId = hostel._id
        query.hostelId = hostelId
      } else {
        return res.json({ security: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostel:", error)
      res.status(500)
      throw new Error("Error searching for hostel")
    }
  }

  // User Search
  if (userName) {
    userQuery.name = { $regex: userName, $options: "i" }
  }
  if (userEmail) {
    userQuery.email = { $regex: userEmail, $options: "i" }
  }
  // Ensure we only search for users with the 'Security' role
  userQuery.role = "Security"

  if (userName || userEmail) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ security: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  } else {
    // If no user criteria, find all security users first
    try {
      const users = await User.find({ role: "Security" }).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        // No users with Security role exist
        return res.json({ security: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding security users:", error)
      res.status(500)
      throw new Error("Error finding security users")
    }
  }

  // --- Execution ---
  try {
    const count = await Security.countDocuments(query)
    const securityPersonnel = await Security.find(query)
      .populate("userId", "name email phone") // Populate user details
      .populate("hostelId", "name") // Populate hostel details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userId.name": 1 }) // Sort by name
      .lean()

    res.json({
      security: securityPersonnel,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching security personnel:", error)
    res.status(500)
    throw new Error("Server error during security search")
  }
})

export { searchSecurity }
