import Warden from "../models/Warden.js"
import User from "../models/User.js"
import bcrypt from "bcrypt"
import Security from "../models/Security.js"
import MaintenanceStaff from "../models/MaintenanceStaff.js"
import Task from "../models/Task.js"

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
    const securities = await Security.find().populate("userId", "name email phone profileImage").exec()

    const formattedSecurities = securities.map((security) => ({
      id: security._id,
      userId: security.userId._id,
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
    const { hostelId, name } = req.body

    const updateData = {}

    updateData.hostelId = hostelId || null

    const updatedSecurity = await Security.findByIdAndUpdate(id, updateData, { new: true })

    if (!updatedSecurity) {
      return res.status(404).json({ message: "Security not found" })
    }

    if (name !== undefined) {
      await User.findByIdAndUpdate(updatedSecurity.userId, { name })
    }

    res.status(200).json({ message: "Security updated successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteSecurity = async (req, res) => {
  try {
    const { id } = req.params

    const deletedSecurity = await Security.findByIdAndDelete(id)
    if (!deletedSecurity) {
      return res.status(404).json({ message: "Security not found" })
    }

    await User.findByIdAndDelete(deletedSecurity.userId)

    res.status(200).json({ message: "Security deleted successfully" })
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

export const createMaintenanceStaff = async (req, res) => {
  try {
    const { email, password, name, phone, category } = req.body

    if (!email || !password || !name || !category) {
      return res.status(400).json({ message: "Email, password, name, and category are required" })
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
      role: "Maintenance Staff",
      phone: phone || null,
    })

    const savedUser = await newUser.save()

    const newMaintenanceStaff = new MaintenanceStaff({
      userId: savedUser._id,
      category,
    })

    await newMaintenanceStaff.save()

    res.status(201).json({
      message: "Maintenance staff created successfully",
      success: true,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getAllMaintenanceStaff = async (req, res) => {
  try {
    const maintenanceStaff = await MaintenanceStaff.find().populate("userId", "name email phone profileImage").exec()

    const formattedMaintenanceStaff = maintenanceStaff.map((staff) => ({
      id: staff._id,
      userId: staff.userId._id,
      name: staff.userId.name,
      email: staff.userId.email,
      phone: staff.userId.phone,
      category: staff.category || null,
      profileImage: staff.userId.profileImage,
    }))
    res.status(200).json(formattedMaintenanceStaff)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateMaintenanceStaff = async (req, res) => {
  console.log("Updating maintenance staff with data:", req.body)

  try {
    const { id } = req.params
    const { name, phone, profileImage, category } = req.body

    const updateData = {}

    if (category !== undefined) {
      updateData.category = category
    }

    const updatedStaff = await MaintenanceStaff.findByIdAndUpdate(id, updateData, { new: true })

    if (!updatedStaff) {
      return res.status(404).json({ message: "Maintenance staff not found" })
    }

    const updateUserData = {}

    if (name !== undefined) {
      updateUserData.name = name
    }

    if (phone !== undefined) {
      updateUserData.phone = phone
    }

    if (profileImage !== undefined) {
      updateUserData.profileImage = profileImage
    }

    if (Object.keys(updateUserData).length > 0) {
      await User.findByIdAndUpdate(updatedStaff.userId, updateUserData)
    }

    console.log("Updated Maintenance Staff:", updatedStaff)

    res.status(200).json({ message: "Maintenance staff updated successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteMaintenanceStaff = async (req, res) => {
  try {
    const { id } = req.params

    const deletedStaff = await MaintenanceStaff.findByIdAndDelete(id)
    if (!deletedStaff) {
      return res.status(404).json({ message: "Maintenance staff not found" })
    }

    await User.findByIdAndDelete(deletedStaff.userId)

    res.status(200).json({ message: "Maintenance staff deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getTaskStats = async (req, res) => {
  try {
    // Get counts of tasks by status
    const taskStats = await Task.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ])

    // Get counts of tasks by category
    const categoryStats = await Task.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ])

    // Get counts of tasks by priority
    const priorityStats = await Task.aggregate([
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ])

    // Get overdue tasks count (due date < now and status not Completed)
    const overdueTasks = await Task.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $ne: "Completed" },
    })

    // Format the response
    const formattedTaskStats = taskStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count
      return acc
    }, {})

    const formattedCategoryStats = categoryStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count
      return acc
    }, {})

    const formattedPriorityStats = priorityStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count
      return acc
    }, {})

    res.status(200).json({
      statusCounts: formattedTaskStats,
      categoryCounts: formattedCategoryStats,
      priorityCounts: formattedPriorityStats,
      overdueTasks,
    })
  } catch (error) {
    console.error("Error fetching task stats:", error)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
