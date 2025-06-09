import HostelGate from "../models/HostelGate.js"
import Hostel from "../models/Hostel.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const createHostelGate = async (req, res) => {
  const { hostelId, password } = req.body
  try {
    const hostel = await Hostel.findById(hostelId)

    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const existingHostelGate = await HostelGate.findOne({ hostelId })
    if (existingHostelGate) {
      return res.status(400).json({ message: "Hostel gate already exists" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    // create a new user
    const user = await User.create({
      name: hostel.name,
      email: `${hostel.name.toLowerCase()}.gate.login@iiti.ac.in`,
      password: hashedPassword,
      role: "Hostel Gate",
    })

    const savedUser = await user.save()

    const hostelGate = await HostelGate.create({ userId: savedUser._id, hostelId })
    res.status(201).json({ message: "Hostel gate created successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getAllHostelGates = async (req, res) => {
  try {
    const hostelGates = await HostelGate.find()
      .populate({
        path: "userId",
        select: "name email",
      })
      .populate({
        path: "hostelId",
        select: "name",
      })
    res.status(200).json({ hostelGates })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const updateHostelGate = async (req, res) => {
  try {
    const { hostelId } = req.params
    const { password } = req.body
    const hostelGate = await HostelGate.findOne({ hostelId })
    if (!hostelGate) {
      return res.status(404).json({ message: "Hostel gate not found" })
    }
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)
    hostelGate.password = hashedPassword
    await hostelGate.save()
    res.status(200).json({ message: "Hostel gate updated successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const deleteHostelGate = async (req, res) => {
  const { hostelId } = req.params
  try {
    const hostelGate = await HostelGate.findOne({ hostelId })
    if (!hostelGate) {
      return res.status(404).json({ message: "Hostel gate not found" })
    }
    await hostelGate.deleteOne()
    res.status(200).json({ message: "Hostel gate deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

export const getHostelGateProfile = async (req, res) => {
  const { hostelId } = req.params
  try {
    const hostelGate = await HostelGate.findOne({ hostelId })
    if (!hostelGate) {
      return res.status(404).json({ message: "Hostel gate not found" })
    }
    res.status(200).json({ message: "Hostel gate profile fetched successfully", hostelGate })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
