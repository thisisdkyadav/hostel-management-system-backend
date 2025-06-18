import HostelSupervisor from "../models/HostelSupervisor.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"

export const getHostelSupervisorProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const hostelSupervisorProfile = await HostelSupervisor.findOne({ userId }).populate("userId", "name email role phone profileImage").populate("hostelIds", "name type").populate("activeHostelId", "name type").exec()

    if (!hostelSupervisorProfile) {
      return res.status(404).json({ message: "Hostel Supervisor profile not found" })
    }

    // Format the response to include activeHostelId as hostelId for compatibility
    const formattedProfile = {
      ...hostelSupervisorProfile.toObject(), // Convert mongoose doc to plain object
      hostelId: hostelSupervisorProfile.activeHostelId, // Add active hostel under the key 'hostelId'
    }

    res.status(200).json(formattedProfile) // Send the formatted profile
  } catch (error) {
    console.error("Error fetching hostel supervisor profile:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const createHostelSupervisor = async (req, res) => {
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
      role: "Hostel Supervisor",
      phone: phone || "",
    })

    const savedUser = await newUser.save()

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : []
    const status = validHostelIds.length > 0 ? "assigned" : "unassigned"
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null

    const newHostelSupervisor = new HostelSupervisor({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
    })

    await newHostelSupervisor.save()

    res.status(201).json({
      message: "Hostel Supervisor created successfully",
    })
  } catch (error) {
    console.error("Error creating hostel supervisor:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllHostelSupervisors = async (req, res) => {
  try {
    const hostelSupervisors = await HostelSupervisor.find().populate("userId", "name email phone profileImage").lean().exec()

    const formattedHostelSupervisors = hostelSupervisors.map((hs) => ({
      id: hs._id,
      userId: hs.userId._id,
      name: hs.userId.name,
      email: hs.userId.email,
      phone: hs.userId.phone,
      hostelIds: hs.hostelIds || [],
      activeHostelId: hs.activeHostelId || null,
      joinDate: hs.joinDate ? hs.joinDate.toISOString().split("T")[0] : null,
      profileImage: hs.userId.profileImage,
      status: hs.status || (hs.hostelIds && hs.hostelIds.length > 0 ? "assigned" : "unassigned"),
    }))

    res.status(200).json(formattedHostelSupervisors)
  } catch (error) {
    console.error("Error getting all hostel supervisors:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateHostelSupervisor = async (req, res) => {
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

      const currentHS = await HostelSupervisor.findById(id).select("activeHostelId hostelIds").lean()
      if (!currentHS) {
        return res.status(404).json({ message: "Hostel Supervisor not found" })
      }

      const currentActiveId = currentHS.activeHostelId ? currentHS.activeHostelId.toString() : null
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

    if (profileImage !== undefined) {
      userUpdateData.profileImage = profileImage
    }

    if (phone !== undefined) {
      userUpdateData.phone = phone
    }

    if (Object.keys(userUpdateData).length > 0) {
      const hostelSupervisor = await HostelSupervisor.findById(id).select("userId")
      if (!hostelSupervisor) {
        return res.status(404).json({ message: "Hostel Supervisor not found" })
      }
      await User.findByIdAndUpdate(hostelSupervisor.userId, userUpdateData)
    }

    if (Object.keys(updateData).length > 0) {
      const updatedHostelSupervisor = await HostelSupervisor.findByIdAndUpdate(id, updateData, { new: true }).lean()
      if (!updatedHostelSupervisor) {
        return res.status(404).json({ message: "Hostel Supervisor not found during update" })
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return res.status(400).json({ message: "No update data provided" })
    }

    res.status(200).json({ message: "Hostel Supervisor updated successfully", success: true })
  } catch (error) {
    console.error("Error updating hostel supervisor:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid Hostel Supervisor ID format" })
    }
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteHostelSupervisor = async (req, res) => {
  try {
    const { id } = req.params

    const deletedHostelSupervisor = await HostelSupervisor.findByIdAndDelete(id)
    if (!deletedHostelSupervisor) {
      return res.status(404).json({ message: "Hostel Supervisor not found" })
    }

    await User.findByIdAndDelete(deletedHostelSupervisor.userId)

    res.status(200).json({ message: "Hostel Supervisor deleted successfully" })
  } catch (error) {
    console.error("Error deleting hostel supervisor:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const setActiveHostelHS = async (req, res) => {
  const userId = req.user._id
  const { hostelId } = req.body

  if (!hostelId) {
    return res.status(400).json({ message: "hostelId is required in the request body" })
  }

  try {
    const hostelSupervisor = await HostelSupervisor.findOne({ userId })

    if (!hostelSupervisor) {
      return res.status(404).json({ message: "Hostel Supervisor profile not found for this user" })
    }

    const isAssigned = hostelSupervisor.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId))

    if (!isAssigned) {
      return res.status(403).json({ message: "Hostel Supervisor is not assigned to the specified hostel" })
    }

    hostelSupervisor.activeHostelId = hostelId
    await hostelSupervisor.save()

    await hostelSupervisor.populate("activeHostelId", "name type")

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
      message: "Active hostel updated successfully for Hostel Supervisor",
      activeHostel: hostelSupervisor.activeHostelId,
    })
  } catch (error) {
    console.error("Error setting active hostel for Hostel Supervisor:", error)
    if (error.name === "CastError") {
      return res.status(400).json({ message: "Invalid hostel ID format" })
    }
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
