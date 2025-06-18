import AssociateWarden from "../models/AssociateWarden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const getAssociateWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const associateWardenProfile = await AssociateWarden.findOne({ userId }).populate("userId", "name email role phone profileImage").populate("hostelIds", "name type").populate("activeHostelId", "name type").exec()

    if (!associateWardenProfile) {
      return res.status(404).json({ message: "Associate Warden profile not found" })
    }

    // Format the response to include activeHostelId as hostelId for compatibility
    const formattedProfile = {
      ...associateWardenProfile.toObject(), // Convert mongoose doc to plain object
      hostelId: associateWardenProfile.activeHostelId, // Add active hostel under the key 'hostelId'
    }

    res.status(200).json(formattedProfile) // Send the formatted profile
  } catch (error) {
    console.error("Error fetching associate warden profile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const createAssociateWarden = async (req, res) => {
  try {
    const { email, password, name, phone, hostelIds, joinDate } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Email, password, and name are required" })
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return res.status(400).json({ message: "hostelIds must be an array" })
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
      role: "Associate Warden",
      phone: phone || "",
    })

    const savedUser = await newUser.save()

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : []
    const status = validHostelIds.length > 0 ? "assigned" : "unassigned"
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null

    const newAssociateWarden = new AssociateWarden({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
    })

    await newAssociateWarden.save()

    res.status(201).json({
      message: "Associate Warden created successfully",
    })
  } catch (error) {
    console.error("Error creating associate warden:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllAssociateWardens = async (req, res) => {
  try {
    const associateWardens = await AssociateWarden.find().populate("userId", "name email phone profileImage").lean().exec()

    const formattedAssociateWardens = associateWardens.map((aw) => ({
      id: aw._id,
      userId: aw.userId._id,
      name: aw.userId.name,
      email: aw.userId.email,
      phone: aw.userId.phone,
      hostelIds: aw.hostelIds || [],
      activeHostelId: aw.activeHostelId || null,
      joinDate: aw.joinDate ? aw.joinDate.toISOString().split("T")[0] : null,
      profileImage: aw.userId.profileImage,
      status: aw.status || (aw.hostelIds && aw.hostelIds.length > 0 ? "assigned" : "unassigned"),
    }))

    res.status(200).json(formattedAssociateWardens)
  } catch (error) {
    console.error("Error getting all associate wardens:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateAssociateWarden = async (req, res) => {
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

      const currentAW = await AssociateWarden.findById(id).select("activeHostelId hostelIds").lean()
      if (!currentAW) {
        return res.status(404).json({ message: "Associate Warden not found" })
      }

      const currentActiveId = currentAW.activeHostelId ? currentAW.activeHostelId.toString() : null
      const newHostelIdStrings = validHostelIds.map((id) => id.toString())

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null
      } else if (currentActiveId && !newHostelIdStrings.includes(currentActiveId)) {
        updateData.activeHostelId = validHostelIds[0]
      } else if (!currentActiveId && validHostelIds.length > 0) {
        updateData.activeHostelId = validHostelIds[0]
      }
    }

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate
    }

    if (phone !== undefined) {
      userUpdateData.phone = phone
    }

    if (profileImage !== undefined) {
      userUpdateData.profileImage = profileImage
    }

    if (Object.keys(userUpdateData).length > 0) {
      const associateWarden = await AssociateWarden.findById(id).select("userId")
      if (!associateWarden) {
        return res.status(404).json({ message: "Associate Warden not found" })
      }
      await User.findByIdAndUpdate(associateWarden.userId, userUpdateData)
    }

    if (Object.keys(updateData).length > 0) {
      const updatedAssociateWarden = await AssociateWarden.findByIdAndUpdate(id, updateData, { new: true }).lean()
      if (!updatedAssociateWarden) {
        return res.status(404).json({ message: "Associate Warden not found during update" })
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return res.status(400).json({ message: "No update data provided" })
    }

    res.status(200).json({ message: "Associate Warden updated successfully", success: true })
  } catch (error) {
    console.error("Error updating associate warden:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid Associate Warden ID format" })
    }
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
    console.error("Error deleting associate warden:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const setActiveHostelAW = async (req, res) => {
  const userId = req.user._id
  const { hostelId } = req.body

  if (!hostelId) {
    return res.status(400).json({ message: "hostelId is required in the request body" })
  }

  try {
    const associateWarden = await AssociateWarden.findOne({ userId })

    if (!associateWarden) {
      return res.status(404).json({ message: "Associate Warden profile not found for this user" })
    }

    const isAssigned = associateWarden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId))

    if (!isAssigned) {
      return res.status(403).json({ message: "Associate Warden is not assigned to the specified hostel" })
    }

    associateWarden.activeHostelId = hostelId
    await associateWarden.save()

    await associateWarden.populate("activeHostelId", "name type")

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
      message: "Active hostel updated successfully for Associate Warden",
      activeHostel: associateWarden.activeHostelId,
    })
  } catch (error) {
    console.error("Error setting active hostel for Associate Warden:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid hostel ID format" })
    }
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
