import AssociateWarden from "../../models/AssociateWarden.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchAssociateWardens = asyncHandler(async (req, res) => {
  const {
    userName,
    userEmail,
    hostelName, // Filter by *any* assigned hostel name
    activeHostelName, // Filter by *active* hostel name
    status,
    joinStartDate,
    joinEndDate,
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const userQuery = {}
  // Removed hostelQuery as we handle hostel lookups directly

  // --- Hostel Filters ---
  // Filter by ANY assigned hostel
  if (hostelName) {
    try {
      const hostel = await Hostel.findOne({ name: { $regex: `^${hostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (hostel) {
        query.hostelIds = { $in: [hostel._id] } // Check if hostelId is in the array
      } else {
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostel by name:", error)
      res.status(500)
      throw new Error("Error searching for hostel by name")
    }
  }

  // Filter by ACTIVE hostel
  if (activeHostelName) {
    try {
      const activeHostel = await Hostel.findOne({ name: { $regex: `^${activeHostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (activeHostel) {
        query.activeHostelId = activeHostel._id // Match the activeHostelId field
      } else {
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding active hostel by name:", error)
      res.status(500)
      throw new Error("Error searching for active hostel by name")
    }
  }

  // --- User Filter ---
  if (userName) userQuery.name = { $regex: userName, $options: "i" }
  if (userEmail) userQuery.email = { $regex: userEmail, $options: "i" }
  userQuery.role = "Associate Warden" // Ensure we only query Associate Warden users

  // If user filters are present, find matching user IDs first
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
    // Optimization: If no specific user is searched, we can get all Associate Warden User IDs
    // to potentially narrow down the AssociateWarden.find later, though mongoose might optimize this.
    try {
      const associateWardenUsers = await User.find({ role: "Associate Warden" }).select("_id").lean()
      if (associateWardenUsers.length === 0) {
        return res.json({ associateWardens: [], page: 1, pages: 0, total: 0 })
      }
      // Add this condition only if other query conditions exist, otherwise it's redundant
      if (Object.keys(query).length > 0) {
        query.userId = { $in: associateWardenUsers.map((u) => u._id) }
      }
    } catch (error) {
      console.error("Error finding associate warden users:", error)
      res.status(500)
      throw new Error("Error finding associate warden users")
    }
  }

  // --- Other Filters ---
  if (status) query.status = status

  if (joinStartDate || joinEndDate) {
    query.joinDate = {}
    if (joinStartDate) query.joinDate.$gte = new Date(joinStartDate)
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
      .populate("hostelIds", "name") // Populate assigned hostels
      .populate("activeHostelId", "name") // Populate active hostel
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userId.name": 1 }) // Sort by user name
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
