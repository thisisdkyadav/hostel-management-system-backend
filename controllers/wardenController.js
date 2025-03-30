import Warden from "../models/Warden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const getWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const wardenProfile = await Warden.findOne({ userId }).populate("userId", "name email role").populate("hostelId", "name type").exec()

    if (!wardenProfile) {
      return res.status(404).json({ message: "Warden profile not found" })
    }

    res.status(200).json(wardenProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const createWarden = async (req, res) => {
  try {
    const { email, password, name, phone, hostelId, status, joinDate } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: "Warden",
      phone: phone || "",
    })

    const savedUser = await newUser.save()

    const newWarden = new Warden({
      userId: savedUser._id,
      hostelId: hostelId || null,
      status: status || "unassigned",
      joinDate: joinDate || Date.now(),
    })

    const savedWarden = await newWarden.save()

    res.status(201).json({
      message: "Warden created successfully",
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllWardens = async (req, res) => {
  try {
    const wardens = await Warden.find().populate("userId", "name email phone profileImage").exec()

    const formattedWardens = wardens.map((warden) => ({
      id: warden._id,
      name: warden.userId.name,
      email: warden.userId.email,
      phone: warden.userId.phone,
      hostelAssigned: warden.hostelId || null,
      joinDate: warden.joinDate.toISOString().split("T")[0],
      profileImage: warden.userId.profileImage,
      status: warden.status,
    }))
    res.status(200).json(formattedWardens)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateWarden = async (req, res) => {
  try {
    const { id } = req.params
    const { phone, joinDate, hostelId } = req.body

    const updateData = {}

    updateData.hostelId = hostelId || null
    updateData.status = hostelId ? "assigned" : "unassigned"

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate
    }

    const updatedWarden = await Warden.findByIdAndUpdate(id, updateData, { new: true })

    if (!updatedWarden) {
      return res.status(404).json({ message: "Warden not found" })
    }

    if (phone !== undefined) {
      await User.findByIdAndUpdate(updatedWarden.userId, { phone })
    }

    res.status(200).json({ message: "Warden updated successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteWarden = async (req, res) => {
  try {
    const { id } = req.params

    const deletedWarden = await Warden.findByIdAndDelete(id)
    if (!deletedWarden) {
      return res.status(404).json({ message: "Warden not found" })
    }

    await User.findByIdAndDelete(deletedWarden.userId)

    res.status(200).json({ message: "Warden deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
