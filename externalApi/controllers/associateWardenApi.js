import AssociateWarden from "../../models/AssociateWarden.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchAssociateWardens = asyncHandler(async (req, res) => {
  const {
    userName,
    userEmail,
    hostelName,
    status,
    joinStartDate, // ISO Date string for joinDate
    joinEndDate,
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
  // Ensure we only search for users with the 'Associate Warden' role
  userQuery.role = "Associate Warden"

  if (userName || userEmail) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  } else {
    // If no user criteria, find all associate warden users first
    try {
      const users = await User.find({ role: "Associate Warden" }).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        // No users with Associate Warden role exist
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding associate warden users:", error)
      res.status(500)
      throw new Error("Error finding associate warden users")
    }
  }

  // Hostel Search
  if (hostelName) {
    hostelQuery.name = { $regex: hostelName, $options: "i" }
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  // --- Build Main Query ---

  if (status) {
    query.status = status
  }

  if (joinStartDate || joinEndDate) {
    query.joinDate = {}
    if (joinStartDate) {
      query.joinDate.$gte = new Date(joinStartDate)
    }
    if (joinEndDate) {
      const endOfDay = new Date(joinEndDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.joinDate.$lte = endOfDay
    }
  }

  // --- Execution ---
  try {
    const count = await AssociateWarden.countDocuments(query)
    const associateWardens = await AssociateWarden.find(query)
      .populate("userId", "name email phone") // Populate user details
      .populate("hostelId", "name") // Populate hostel details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userId.name": 1 }) // Sort by name
      .lean()

    res.json({
      associateWardens,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching associate wardens:", error)
    res.status(500)
    throw new Error("Server error during associate warden search")
  }
})

export { searchAssociateWardens }
