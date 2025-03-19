import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Complaint from "../models/Complaint.js"
import Warden from "../models/Warden.js"

export const addHostel = async (req, res) => {
  try {
    const { name, gender, type, location, wardenId, units, rooms } = req.body

    if (!name || !gender || !type) {
      return res.status(400).json({ message: "Missing required hostel information" })
    }

    const newHostel = new Hostel({
      name,
      gender,
      type,
      location: location || "",
    })

    const savedHostel = await newHostel.save()
    const hostelId = savedHostel._id

    const createdUnits = {}
    if (type === "unit-based" && Array.isArray(units)) {
      for (const unitData of units) {
        const { unitNumber, floor, commonAreaDetails } = unitData

        if (!unitNumber) {
          continue
        }

        const unit = new Unit({
          hostelId,
          unitNumber,
          floor: floor || 0,
          commonAreaDetails: commonAreaDetails || "",
        })

        const savedUnit = await unit.save()
        createdUnits[unitNumber] = savedUnit._id
      }
    }

    if (Array.isArray(rooms)) {
      for (const roomData of rooms) {
        const { unitNumber, roomNumber, capacity, status } = roomData

        if (!roomNumber || !capacity) {
          continue
        }

        const roomFields = {
          hostelId,
          roomNumber,
          capacity,
          status: status || "Available",
          occupancy: 0,
        }

        if (type === "unit-based" && unitNumber && createdUnits[unitNumber]) {
          roomFields.unitId = createdUnits[unitNumber]
        }

        const room = new Room(roomFields)
        await room.save()
      }
    }

    const totalRooms = Array.isArray(rooms) ? rooms.length : 0

    res.status(201).json({
      message: "Hostel added successfully",
      hostel: {
        id: hostelId,
        name,
        gender,
        type,
        location: location || "",
        totalUnits: Object.keys(createdUnits).length,
        totalRooms,
      },
    })
  } catch (error) {
    if (error.code === 11000) {
      if (error.keyPattern?.name) {
        return res.status(400).json({ message: "A hostel with this name already exists" })
      }
      if (error.keyPattern?.["hostelId"] && error.keyPattern?.["unitNumber"]) {
        return res.status(400).json({ message: "Duplicate unit number in this hostel" })
      }
      if (error.keyPattern?.["hostelId"] && error.keyPattern?.["unitId"] && error.keyPattern?.["roomNumber"]) {
        return res.status(400).json({ message: "Duplicate room number in this unit/hostel" })
      }
    }

    res.status(500).json({ message: "Error adding hostel", error: error.message })
  }
}

export const getHostels = async (req, res) => {
  try {
    const hostelsData = await Hostel.find()

    console.log("Hostels Data:", hostelsData)

    const hostels = []

    for (const hostel of hostelsData) {
      const rooms = await Room.find({ hostelId: hostel._id })

      const totalRooms = rooms.length
      const occupiedRooms = rooms.filter((room) => room.status === "Occupied").length
      const vacantRooms = rooms.filter((room) => room.status === "Available").length

      const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0)
      const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0)
      const occupancyRate = totalRooms > 0 ? Math.round((currentOccupancy / capacity) * 100) : 0

      console.log("Hostel:", hostel.name)

      const maintenanceIssues = await Complaint.countDocuments({
        hostelId: hostel._id,
        status: { $in: ["Pending", "In Progress"] },
        complaintType: { $in: ["Electricity", "Water", "Civil", "Other"] },
      })

      console.log("Maintenance Issues:", maintenanceIssues)

      const wardenDocs = await Warden.find({ hostelId: hostel._id }).populate("userId")
      const wardens = wardenDocs.map((warden) => warden.userId.name || `Warden ID: ${warden.userId._id}`)

      console.log("Wardens:", wardens)

      hostels.push({
        id: hostel._id,
        name: hostel.name,
        type: hostel.type,
        gender: hostel.gender,
        wardens: wardens,
        totalRooms: totalRooms,
        occupiedRooms: occupiedRooms,
        vacantRooms: vacantRooms,
        maintenanceIssues: maintenanceIssues,
        capacity: capacity,
        occupancyRate: occupancyRate,
      })
    }

    console.log("Formatted Hostels Data:", hostels)

    res.status(200).json(hostels)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}

export const updateHostel = async (req, res) => {
  const { id } = req.params
  const { name, type, gender, location } = req.body
  try {
    const updatedHostel = await Hostel.findByIdAndUpdate(id, { name, type, gender, location }, { new: true })
    if (!updatedHostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }
    res.status(200).json(updatedHostel)
  } catch (error) {
    res.status(500).json({ message: "Error updating hostel", error: error.message })
  }
}

export const getHostelList = async (req, res) => {
  try {
    const hostels = await Hostel.find({}, { _id: 1, name: 1 })
    res.status(200).json(hostels)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}
