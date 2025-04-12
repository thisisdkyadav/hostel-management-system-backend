import Event from "../../models/Event.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"
const searchEvents = asyncHandler(async (req, res) => {
  const {
    keyword, // General keyword for eventName/description
    hostelName,
    gender,
    startDate, // ISO Date string for event date
    endDate, // ISO Date string for event date
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const hostelQuery = {}

  if (keyword) {
    query.$or = [{ eventName: { $regex: keyword, $options: "i" } }, { description: { $regex: keyword, $options: "i" } }]
  }

  if (gender) {
    query.gender = gender
  }

  if (startDate || endDate) {
    query.dateAndTime = {}
    if (startDate) {
      query.dateAndTime.$gte = new Date(startDate)
    }
    if (endDate) {
      // Adjust endDate to include the whole day
      const endOfDay = new Date(endDate)
      endOfDay.setHours(23, 59, 59, 999)
      query.dateAndTime.$lte = endOfDay
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
        return res.json({
          events: [],
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
    const count = await Event.countDocuments(query)
    const events = await Event.find(query)
      .populate("hostelId", "name") // Populate hostel details
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ dateAndTime: -1 }) // Sort by event date descending
      .lean()

    res.json({
      events,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching events:", error)
    res.status(500)
    throw new Error("Server error during event search")
  }
})

export { searchEvents }
