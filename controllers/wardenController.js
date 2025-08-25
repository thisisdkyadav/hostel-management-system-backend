import Warden from "../models/Warden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const getWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const wardenProfile = await Warden.findOne({ userId }).populate("userId", "name email role phone profileImage").populate("hostelIds", "name type").populate("activeHostelId", "name type").exec()

    if (!wardenProfile) {
      return res.status(404).json({ message: "Warden profile not found" })
    }

    const formattedWardenProfile = {
      ...wardenProfile.toObject(),
      hostelId: wardenProfile.activeHostelId,
    }

    res.status(200).json(formattedWardenProfile)
  } catch (error) {
    console.error("Error fetching warden profile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const createWarden = async (req, res) => {
  try {
    const { email, password, name, phone, hostelIds, joinDate } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" })
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return res.status(400).json({ message: "hostelIds must be an array" })
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
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

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : []
    const status = validHostelIds.length > 0 ? "assigned" : "unassigned"
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null

    const newWarden = new Warden({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
    })

    await newWarden.save()

    res.status(201).json({
      message: "Warden created successfully",
    })
  } catch (error) {
    console.error("Error creating warden:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllWardens = async (req, res) => {
  try {
    const wardens = await Warden.find().populate("userId", "name email phone profileImage").lean().exec()

    const formattedWardens = wardens.map((warden) => ({
      id: warden._id,
      userId: warden.userId._id,
      name: warden.userId.name,
      email: warden.userId.email,
      phone: warden.userId.phone,
      hostelIds: warden.hostelIds || [],
      activeHostelId: warden.activeHostelId || null,
      joinDate: warden.joinDate ? warden.joinDate.toISOString().split("T")[0] : null,
      profileImage: warden.userId.profileImage,
      status: warden.status || (warden.hostelIds && warden.hostelIds.length > 0 ? "assigned" : "unassigned"),
    }))

    formattedWardens.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes("chief")
      const bHasChief = b.email.toLowerCase().includes("chief")

      if (aHasChief && !bHasChief) return -1
      if (!aHasChief && bHasChief) return 1

      return a.name.localeCompare(b.name)
    })
    res.status(200).json(formattedWardens)
  } catch (error) {
    console.error("Error getting all wardens:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateWarden = async (req, res) => {
  try {
    const { id } = req.params
    const { phone, profileImage, joinDate, hostelIds } = req.body

    if (hostelIds && !Array.isArray(hostelIds)) {
      return res.status(400).json({ message: "hostelIds must be an array" })
    }

    const updateData = {}
    let userUpdateData = {}

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : []
      updateData.hostelIds = validHostelIds
      updateData.status = validHostelIds.length > 0 ? "assigned" : "unassigned"

      const currentWarden = await Warden.findById(id).select("activeHostelId hostelIds").lean()
      if (!currentWarden) {
        return res.status(404).json({ message: "Warden not found" })
      }

      const currentActiveId = currentWarden.activeHostelId ? currentWarden.activeHostelId.toString() : null
      const newHostelIdStrings = validHostelIds.map((id) => id.toString())

      console.log(validHostelIds, newHostelIdStrings)

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null
      } else if (!currentActiveId || (currentActiveId && !newHostelIdStrings.includes(currentActiveId))) {
        updateData.activeHostelId = validHostelIds[0]
        console.log(updateData)
      }
    }

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate
    }

    if (profileImage !== undefined) {
      userUpdateData.profileImage = profileImage
    }

    if (phone !== undefined) {
      userUpdateData.phone = phone
    }

    if (Object.keys(userUpdateData).length > 0) {
      const warden = await Warden.findById(id).select("userId")
      if (!warden) {
        return res.status(404).json({ message: "Warden not found" })
      }
      await User.findByIdAndUpdate(warden.userId, userUpdateData)
    }

    if (Object.keys(updateData).length > 0) {
      const updatedWarden = await Warden.findByIdAndUpdate(id, updateData, { new: true }).lean()

      if (!updatedWarden) {
        return res.status(404).json({ message: "Warden not found during update" })
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return res.status(400).json({ message: "No update data provided" })
    }

    res.status(200).json({ message: "Warden updated successfully" })
  } catch (error) {
    console.error("Error updating warden:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid Warden ID format" })
    }
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

export const setActiveHostel = async (req, res) => {
  const userId = req.user._id
  const { hostelId } = req.body

  if (!hostelId) {
    return res.status(400).json({ message: "hostelId is required in the request body" })
  }

  try {
    const warden = await Warden.findOne({ userId })

    if (!warden) {
      return res.status(404).json({ message: "Warden profile not found for this user" })
    }

    const isAssigned = warden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId))

    if (!isAssigned) {
      return res.status(403).json({ message: "Warden is not assigned to the specified hostel" })
    }

    warden.activeHostelId = hostelId
    await warden.save()

    await warden.populate("activeHostelId", "name type")

    // Refresh user data in session after changing active hostel
    const user = await User.findById(userId)
    if (user) {
      // Update the session with fresh essential user data
      req.session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        permissions: Object.fromEntries(user.permissions || new Map()),
        hostel: user.hostel, // This will have updated hostel info after the populate middleware runs
      }
      await req.session.save()
    }

    res.status(200).json({
      message: "Active hostel updated successfully",
      activeHostel: warden.activeHostelId,
    })
  } catch (error) {
    console.error("Error setting active hostel:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid hostel ID format" })
    }
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
