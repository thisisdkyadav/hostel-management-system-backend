import Warden from "../../models/Warden.js"
import User from "../../models/User.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchWardens = asyncHandler(async (req, res) => {
  const { userName, userEmail, hostelName, activeHostelName, status, joinStartDate, joinEndDate, page = 1, limit = 10 } = req.query

  const query = {}
  const userQuery = {}
  let hostelId = null
  let activeHostelId = null

  if (hostelName) {
    try {
      const hostel = await Hostel.findOne({ name: { $regex: `^${hostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (hostel) {
        query.hostelIds = { $in: [hostel._id] }
      } else {
        return res.json({ wardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostel by name:", error)
      res.status(500)
      throw new Error("Error searching for hostel by name")
    }
  }

  if (activeHostelName) {
    try {
      const activeHostel = await Hostel.findOne({ name: { $regex: `^${activeHostelName}$`, $options: "i" } })
        .select("_id")
        .lean()
      if (activeHostel) {
        query.activeHostelId = activeHostel._id
      } else {
        return res.json({ wardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding active hostel by name:", error)
      res.status(500)
      throw new Error("Error searching for active hostel by name")
    }
  }

  if (userName) {
    userQuery.name = { $regex: userName, $options: "i" }
  }
  if (userEmail) {
    userQuery.email = { $regex: userEmail, $options: "i" }
  }
  userQuery.role = "Warden"

  if (userName || userEmail) {
    try {
      const users = await User.find(userQuery).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ wardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding users:", error)
      res.status(500)
      throw new Error("Error searching for users")
    }
  } else {
    try {
      const users = await User.find({ role: "Warden" }).select("_id").lean()
      if (users.length > 0) {
        query.userId = { $in: users.map((u) => u._id) }
      } else {
        return res.json({ wardens: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding warden users:", error)
      res.status(500)
      throw new Error("Error finding warden users")
    }
  }

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

  try {
    const count = await Warden.countDocuments(query)
    const wardens = await Warden.find(query)
      .populate("userId", "name email phone")
      .populate("hostelIds", "name")
      .populate("activeHostelId", "name")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "userId.name": 1 })
      .lean()

    res.json({
      wardens,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching wardens:", error)
    res.status(500)
    throw new Error("Server error during warden search")
  }
})

export { searchWardens }
