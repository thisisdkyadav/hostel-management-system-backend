import Warden from "../models/Warden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"
import Security from "../models/Security.js"

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
      warden: {
        ...savedWarden._doc,
        user: {
          name: savedUser.name,
          email: savedUser.email,
          phone: savedUser.phone,
        },
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllWardens = async (req, res) => {
  try {
    const wardens = await Warden.find().populate("userId", "name email phone profilePic").exec()

    const formattedWardens = wardens.map((warden) => ({
      id: warden._id,
      name: warden.userId.name,
      email: warden.userId.email,
      phone: warden.userId.phone,
      hostelAssigned: warden.hostelId || null,
      joinDate: warden.joinDate.toISOString().split("T")[0],
      profilePic: warden.userId.profilePic,
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

export const createSecurity = async (req, res) => {
  try {
    const { email, password, name, hostelId } = req.body

    console.log("Creating security with data:", req.body)

    if (!email || !password || !name || !hostelId) {
      return res.status(400).json({ message: "Email, password, name, and hostelId are required" })
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
      role: "Security",
    })

    const savedUser = await newUser.save()

    console.log("Saved User:", savedUser)
    console.log("Hostel ID:", hostelId)

    const newSecurity = new Security({
      userId: savedUser._id,
      hostelId,
    })

    console.log("New Security:", newSecurity)

    const savedSecurity = await newSecurity.save()

    console.log("Saved Security:", savedSecurity)

    res.status(201).json({
      message: "Security created successfully",
      security: {
        ...savedSecurity._doc,
        user: {
          name: savedUser.name,
          email: savedUser.email,
          phone: savedUser.phone,
        },
      },
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllSecurities = async (req, res) => {
  try {
    const securities = await Security.find().populate("userId", "name email phone profilePic").exec()

    const formattedSecurities = securities.map((security) => ({
      id: security._id,
      name: security.userId.name,
      email: security.userId.email,
      phone: security.userId.phone,
      hostelId: security.hostelId || null,
    }))
    res.status(200).json(formattedSecurities)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateSecurity = async (req, res) => {
  try {
    const { id } = req.params
    const { hostelId } = req.body

    const updateData = {}

    updateData.hostelId = hostelId || null

    const updatedSecurity = await Security.findByIdAndUpdate(id, updateData, { new: true })

    if (!updatedSecurity) {
      return res.status(404).json({ message: "Security not found" })
    }

    res.status(200).json({ message: "Security updated successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateUserPassword = async (req, res) => {
  const { email, newPassword } = req.body
  console.log("Updating password for email:", email)
  console.log("New password:", newPassword)

  try {
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(newPassword, salt)

    const updatedUser = await User.findOneAndUpdate({ email }, { password: hashedPassword }, { new: true })

    console.log("Updated User:", updatedUser)

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json({ message: "Password updated successfully", success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
