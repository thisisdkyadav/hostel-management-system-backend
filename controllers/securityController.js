import Security from "../models/Security.js"
import Warden from "../models/Warden.js"
import Visitor from "../models/Visitors.js"
import CheckInOut from "../models/CheckInOut.js"
import RoomAllocation from "../models/RoomAllocation.js"
import Unit from "../models/Unit.js"
import Room from "../models/Room.js"

export const getSecurity = async (req, res) => {
  const user = req.user

  try {
    const security = await Security.findOne({ userId: user._id }).populate("hostelId", "name type").exec()
    if (!security) {
      return res.status(404).json({ message: "Security not found" })
    }
    if (!security) {
      return res.status(404).json({ message: "Security not found" })
    }

    res.status(200).json({
      security: {
        _id: security._id,
        name: security.name,
        email: security.email,
        phone: security.phone,
        hostelId: security.hostelId,
        hostelName: security.hostelId ? security.hostelId.name : null,
        hostelType: security.hostelId ? security.hostelId.type : "unit-based",
      },
    })
  } catch (error) {
    console.error("Error fetching security:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const addStudentEntry = async (req, res) => {
  const { hostelId, unit, room, bed, date, time, status } = req.body
  try {
    const studentUnit = await Unit.findOne({ unitNumber: unit, hostelId })
    if (!studentUnit) {
      return res.status(404).json({ message: "Unit not found" })
    }

    const studentRoom = await Room.findOne({ unitId: studentUnit._id, hostelId, roomNumber: room })
    if (!studentRoom) {
      return res.status(404).json({ message: "Room not found" })
    }

    const roomAllocation = await RoomAllocation.findOne({
      roomId: studentRoom._id,
      bedNumber: bed,
    })
      .populate("userId")
      .exec()

    if (!roomAllocation) {
      return res.status(404).json({ message: "Room allocation not found" })
    }
    let dateAndTime
    if (date && time) {
      const dateTimeString = `${date} ${time}`
      dateAndTime = new Date(dateTimeString)
    } else {
      dateAndTime = new Date()
    }

    const studentEntry = new CheckInOut({
      userId: roomAllocation.userId,
      hostelId,
      unit,
      room,
      bed,
      dateAndTime,
      status,
    })

    await studentEntry.save()

    res.status(201).json({ message: "Student entry added successfully", success: true, studentEntry })
  } catch (error) {
    console.error("Error adding student entry:", error)
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const getRecentEntries = async (req, res) => {
  const user = req.user

  try {
    const userRole = user.role

    let hostelId
    if (userRole === "Security") {
      const security = await Security.findOne({ userId: user._id })
      hostelId = security.hostelId
    } else if (userRole === "Warden") {
      const warden = await Warden.findOne({ userId: user._id })
      hostelId = warden.hostelId
    } else {
      return res.status(403).json({ message: "Access denied" })
    }

    if (!hostelId) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const recentEntries = await CheckInOut.find({ hostelId }).sort({ dateAndTime: -1 }).limit(10).populate("userId", "name email phone").exec()

    res.status(200).json(recentEntries)
  } catch (error) {
    console.error("Error fetching recent entries:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getStudentEntries = async (req, res) => {
  const { status, date, search } = req.query
  const user = req.user
  try {
    const userRole = user.role
    let hostelId
    if (userRole === "Security") {
      const security = await Security.findOne({ userId: user._id })
      hostelId = security.hostelId
    } else if (userRole === "Warden") {
      const warden = await Warden.findOne({ userId: user._id })
      hostelId = warden.hostelId
    } else {
      return res.status(403).json({ message: "Access denied" })
    }

    if (!hostelId) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const query = { hostelId }
    if (status) query.status = status
    if (date) query.dateAndTime = { $gte: new Date(date) }
    if (search) {
      query.$or = [{ "userId.name": { $regex: search, $options: "i" } }, { "userId.email": { $regex: search, $options: "i" } }, { room: { $regex: search, $options: "i" } }, { unit: { $regex: search, $options: "i" } }, { bed: { $regex: search, $options: "i" } }]
    }

    const studentEntries = await CheckInOut.find(query).populate("userId", "name email phone").exec()
    res.status(200).json(studentEntries)
  } catch (error) {
    console.error("Error fetching student entries:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const updateStudentEntry = async (req, res) => {
  const { unit, room, bed, date, time, status } = req.body
  const { entryId } = req.params
  try {
    const studentEntry = await CheckInOut.findById(entryId)
    if (!studentEntry) {
      return res.status(404).json({ message: "Entry not found" })
    }
    studentEntry.unit = unit
    studentEntry.room = room
    studentEntry.bed = bed
    let dateAndTime
    if (date && time) {
      const dateTimeString = `${date} ${time}`
      dateAndTime = new Date(dateTimeString)
    } else {
      dateAndTime = new Date()
    }
    studentEntry.dateAndTime = dateAndTime
    studentEntry.status = status
    await studentEntry.save()
    res.status(200).json({ message: "Student entry updated successfully", success: true, studentEntry })
  } catch (error) {
    console.error("Error updating student entry:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const addVisitor = async (req, res) => {
  const { name, phone, room } = req.body
  const user = req.user

  try {
    const security = await Security.findOne({ userId: user._id }).populate("hostelId").exec()
    if (!security) {
      return res.status(404).json({ message: "Security not found" })
    }

    const visitor = new Visitor({
      hostelId: security.hostelId._id,
      name,
      phone,
      room,
    })

    await visitor.save()

    res.status(201).json({ message: "Visitor added successfully", visitor })
  } catch (error) {
    console.error("Error adding visitor:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getVisitors = async (req, res) => {
  const user = req.user

  try {
    const userRole = user.role

    let hostelId
    if (userRole === "Security") {
      const security = await Security.findOne({ userId: user._id })
      hostelId = security.hostelId
    } else if (userRole === "Warden") {
      const warden = await Warden.findOne({ userId: user._id })
      hostelId = warden.hostelId
    } else {
      return res.status(403).json({ message: "Access denied" })
    }

    if (!hostelId) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const visitors = await Visitor.find({ hostelId }).exec()

    res.status(200).json(visitors)
  } catch (error) {
    console.error("Error fetching visitors:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const updateVisitor = async (req, res) => {
  const { name, phone, DateTime, room, status } = req.body
  const { visitorId } = req.params
  try {
    const visitor = await Visitor.findById(visitorId)
    if (!visitor) {
      return res.status(404).json({ message: "Visitor not found" })
    }

    visitor.name = name
    visitor.phone = phone
    visitor.DateTime = DateTime
    visitor.room = room
    visitor.status = status

    await visitor.save()
    res.status(200).json({ message: "Visitor updated successfully", visitor })
  } catch (error) {
    console.error("Error updating visitor:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
