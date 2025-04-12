import Unit from "../../models/Unit.js"
import Hostel from "../../models/Hostel.js"
import asyncHandler from "express-async-handler"

const searchUnits = asyncHandler(async (req, res) => {
  const { hostelName, unitNumber, floor, page = 1, limit = 10 } = req.query

  const query = {}
  const hostelQuery = {}

  if (hostelName) {
    hostelQuery.name = { $regex: hostelName, $options: "i" }
    try {
      const hostels = await Hostel.find(hostelQuery).select("_id").lean()
      if (hostels.length > 0) {
        query.hostelId = { $in: hostels.map((h) => h._id) }
      } else {
        return res.json({ units: [], page: 1, pages: 0, total: 0 })
      }
    } catch (error) {
      console.error("Error finding hostels:", error)
      res.status(500)
      throw new Error("Error searching for hostels")
    }
  }

  if (unitNumber) {
    query.unitNumber = { $regex: unitNumber, $options: "i" }
  }

  if (floor) {
    query.floor = Number(floor)
  }

  try {
    const count = await Unit.countDocuments(query)
    const units = await Unit.find(query)
      .populate("hostelId", "name")
      .populate({
        path: "rooms",
        select: "capacity occupancy status",
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "hostelId.name": 1, unitNumber: 1 })
      .lean()

    const formattedUnits = units.map((unit) => {
      let roomCount = 0
      let capacity = 0
      let occupancy = 0
      if (unit.rooms) {
        roomCount = unit.rooms.length
        const activeRooms = unit.rooms.filter((room) => room.status === "Active")
        capacity = activeRooms.reduce((total, room) => total + room.capacity, 0)
        occupancy = activeRooms.reduce((total, room) => total + room.occupancy, 0)
      }
      return {
        ...unit,
        roomCount,
        capacity,
        occupancy,
      }
    })

    res.json({
      units: formattedUnits,
      page: Number(page),
      pages: Math.ceil(count / limit),
      total: count,
    })
  } catch (error) {
    console.error("Error searching units:", error)
    res.status(500)
    throw new Error("Server error during unit search")
  }
})

export { searchUnits }
