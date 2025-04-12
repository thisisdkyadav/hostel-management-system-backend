import LostAndFound from "../../models/LostAndFound.js"
import asyncHandler from "express-async-handler"

const searchLostAndFound = asyncHandler(async (req, res) => {
  const {
    keyword,
    status,
    startDate, // ISO Date string for dateFound
    endDate,
    page = 1,
    limit = 10,
  } = req.query

  const query = {}

  if (keyword) {
    query.$or = [{ itemName: { $regex: keyword, $options: "i" } }, { description: { $regex: keyword, $options: "i" } }]
  }

  if (status) {
    query.status = status
  }

  if (startDate || endDate) {
    query.dateFound = {}
    if (startDate) {
      query.dateFound.$gte = new Date(startDate)
    }
    if (endDate) {
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.dateFound.$lte = endOfDay
    }
  }

  // --- Execution ---
  try {
    const count = await LostAndFound.countDocuments(query)
    const items = await LostAndFound.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ dateFound: -1 }) // Sort by date found descending
      .lean()

    res.json({
      items,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching lost and found items:", error)
    res.status(500)
    throw new Error("Server error during lost and found search")
  }
})

export { searchLostAndFound }
