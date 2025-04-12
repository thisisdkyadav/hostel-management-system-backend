import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchHostels = asyncHandler(async (req, res) => {
  const {
    name,
    type,
    gender,
    page = 1,
    limit = 10, // Or maybe return all if the list is short?
  } = req.query

  const query = {}

  if (name) {
    query.name = { $regex: name, $options: "i" }
  }

  if (type) {
    query.type = type
  }

  if (gender) {
    query.gender = gender
  }

  // --- Execution ---
  try {
    const count = await Hostel.countDocuments(query)
    const hostels = await Hostel.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ name: 1 }) // Sort by name ascending
      .lean()

    res.json({
      hostels,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching hostels:", error)
    res.status(500)
    throw new Error("Server error during hostel search")
  }
})

export { searchHostels }
