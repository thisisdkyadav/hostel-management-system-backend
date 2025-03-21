import Security from "../models/Security.js"
import Hostel from "../models/Hostel.js"
import User from "../models/User.js"
import Warden from "../models/Warden.js"
import Visitor from "../models/Visitors.js"

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
