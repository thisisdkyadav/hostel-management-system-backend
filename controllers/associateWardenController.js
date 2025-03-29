import AssociateWarden from "../models/AssociateWarden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const getAssociateWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const associateWardenProfile = await AssociateWarden.findOne({ userId }).populate("userId", "name email role").populate("hostelId", "name type").exec()

    if (!associateWardenProfile) {
      return res.status(404).json({ message: "Associate Warden profile not found" })
    }

    res.status(200).json(associateWardenProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const createAssociateWarden = async (req, res) => {
  try {
    const { email, password, name, phone, hostelId, status, joinDate } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" })
    }

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      console.log(existingUser)

      return res.status(400).json({ message: "User with this email already exists" })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: "Associate Warden",
      phone: phone || "",
    })

    const savedUser = await newUser.save()

    const newAssociateWarden = new AssociateWarden({
      userId: savedUser._id,
      hostelId: hostelId || null,
      status: status || "unassigned",
      joinDate: joinDate || Date.now(),
    })

    await newAssociateWarden.save()

    res.status(201).json({
      message: "Associate Warden created successfully",
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllAssociateWardens = async (req, res) => {
  try {
    const associateWardens = await AssociateWarden.find().populate("userId", "name email phone profilePic").exec()

    const formattedAssociateWardens = associateWardens.map((associateWarden) => ({
      id: associateWarden._id,
      name: associateWarden.userId.name,
      email: associateWarden.userId.email,
      phone: associateWarden.userId.phone,
      hostelAssigned: associateWarden.hostelId || null,
      joinDate: associateWarden.joinDate.toISOString().split("T")[0],
      profilePic: associateWarden.userId.profilePic,
      status: associateWarden.status,
    }))
    res.status(200).json(formattedAssociateWardens)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateAssociateWarden = async (req, res) => {
  try {
    const { id } = req.params
    const { phone, joinDate, hostelId } = req.body

    const updateData = {}

    updateData.hostelId = hostelId || null
    updateData.status = hostelId ? "assigned" : "unassigned"

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate
    }

    const updatedAssociateWarden = await AssociateWarden.findByIdAndUpdate(id, updateData, { new: true })

    if (!updatedAssociateWarden) {
      console.log(updatedAssociateWarden, "updatedAssociateWarden not found")

      return res.status(404).json({ message: "Associate Warden not found" })
    }
    console.log(updatedAssociateWarden, "updatedAssociateWarden")

    if (phone !== undefined) {
      await User.findByIdAndUpdate(updatedAssociateWarden.userId, { phone })
    }

    console.log("Associate Warden updated successfully")

    res.status(200).json({ message: "Associate Warden updated successfully", success: true })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteAssociateWarden = async (req, res) => {
  try {
    const { id } = req.params

    const deletedAssociateWarden = await AssociateWarden.findByIdAndDelete(id)
    if (!deletedAssociateWarden) {
      return res.status(404).json({ message: "Associate Warden not found" })
    }

    await User.findByIdAndDelete(deletedAssociateWarden.userId)

    res.status(200).json({ message: "Associate Warden deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
