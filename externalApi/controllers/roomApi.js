import Room from "../../models/Room.js"
import Hostel from "../../models/Hostel.js"
import Unit from "../../models/Unit.js"
import asyncHandler from "express-async-handler"

const searchRooms = asyncHandler(async (req, res) => {
  const {
    roomNumber,
    hostelName,
    unitNumber, // Search by unit number
    status,
    capacity, // Exact capacity
    minCapacity,
    maxCapacity,
    occupancy, // Exact occupancy
    minOccupancy,
    maxOccupancy,
    isAvailable, // boolean: true for occupancy < capacity
    page = 1,
    limit = 10,
  } = req.query

  const query = {}
  const hostelQuery = {}
  const unitQuery = {}

  if (roomNumber) {
    query.roomNumber = { $regex: roomNumber, $options: "i" }
  }

  if (status) {
    query.status = status
  }

  // Capacity filters
  if (capacity) {
    query.capacity = Number(capacity)
  }
  if (minCapacity || maxCapacity) {
    query.capacity = query.capacity || {}
    if (minCapacity) query.capacity.$gte = Number(minCapacity)
    if (maxCapacity) query.capacity.$lte = Number(maxCapacity)
  }

  // Occupancy filters
  if (occupancy) {
    query.occupancy = Number(occupancy)
  }
  if (minOccupancy || maxOccupancy) {
    query.occupancy = query.occupancy || {}
    if (minOccupancy) query.occupancy.$gte = Number(minOccupancy)
    if (maxOccupancy) query.occupancy.$lte = Number(maxOccupancy)
  }

  // Availability filter
  if (isAvailable === "true") {
    query.$expr = { $lt: ["$occupancy", "$capacity"] }
  }
  if (isAvailable === "false") {
    query.$expr = { $gte: ["$occupancy", "$capacity"] }
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
        return res.json({ rooms: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  // Unit Search
  if (unitNumber) {
    unitQuery.unitNumber = { $regex: unitNumber, $options: "i" }
    // If hostelId is already determined, filter units by that hostel
    if (query.hostelId) {
      unitQuery.hostelId = query.hostelId
    }
  }

  if (Object.keys(unitQuery).length > 0) {
    try {
      const units = await Unit.find(unitQuery).select("_id").lean()
      if (units.length > 0) {
        query.unitId = { $in: units.map((u) => u._id) }
      } else {
        return res.json({ rooms: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding units:", error)
      res.status(500)
      throw new Error("Error searching for units")
    }
  }

  // --- Execution ---
  try {
    const count = await Room.countDocuments(query)
    const rooms = await Room.find(query)
      .populate("hostelId", "name type") // Populate hostel details
      .populate("unitId", "unitNumber floor") // Populate unit details if available
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "hostelId.name": 1, "unitId.unitNumber": 1, roomNumber: 1 }) // Sort order
      .lean()

    res.json({
      rooms,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching rooms:", error)
    res.status(500)
    throw new Error("Server error during room search")
  }
})

export { searchRooms }
