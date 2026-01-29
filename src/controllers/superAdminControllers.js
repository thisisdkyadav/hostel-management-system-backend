import ApiClient from "../../models/ApiClient.js"
import User from "../../models/User.js"
import crypto from "crypto"
import bcrypt from "bcrypt"
import Admin from "../../models/Admin.js"

export const createApiClient = async (req, res) => {
  const { name, expiresAt } = req.body

  if (!name) {
    return res.status(400).json({ message: "Name is required" })
  }

  try {
    const apiKey = crypto.randomBytes(32).toString("hex")
    const newClient = new ApiClient({
      name,
      apiKey,
      expiresAt,
    })
    await newClient.save()
    res.status(201).json({ message: "API client created successfully", clientId: newClient._id, apiKey })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "API client with this name already exists" })
    }
    res.status(500).json({ message: "Failed to create API client", error })
  }
}

export const getApiClients = async (req, res) => {
  try {
    const clients = await ApiClient.find()
    res.status(200).json(clients)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch API clients", error })
  }
}

export const deleteApiClient = async (req, res) => {
  const { clientId } = req.params

  try {
    await ApiClient.findByIdAndDelete(clientId)
    res.status(200).json({ message: "API client deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete API client", error })
  }
}

export const updateApiClient = async (req, res) => {
  const { clientId } = req.params
  const { name, expiresAt, isActive } = req.body
  try {
    const updatedClient = await ApiClient.findByIdAndUpdate(clientId, { name, expiresAt, isActive }, { new: true })
    res.status(200).json({ message: "API client updated successfully", updatedClient })
  } catch (error) {
    res.status(500).json({ message: "Failed to update API client", error })
  }
}

export const createAdmin = async (req, res) => {
  const { name, email, password, phone, category } = req.body

  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" })
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  try {
    const newUser = new User({
      name,
      email,
      role: "Admin",
      password: hashedPassword,
      phone,
    })
    await newUser.save()

    const newAdmin = new Admin({
      userId: newUser._id,
      category,
    })
    await newAdmin.save()

    res.status(201).json({ message: "Admin created successfully", adminId: newAdmin._id })
  } catch (error) {
    res.status(500).json({ message: "Failed to create admin", error })
  }
}

export const getAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().populate("userId", "name email phone profileImage role permissions")
    const response = admins.map((admin) => ({
      _id: admin.userId._id,
      id: admin.userId._id,
      name: admin.userId.name,
      email: admin.userId.email,
      phone: admin.userId.phone,
      profileImage: admin.userId.profileImage,
      role: admin.userId.role,
      category: admin.category,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    }))
    res.status(200).json(response)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch admins", error })
  }
}

export const updateAdmin = async (req, res) => {
  const { adminId } = req.params
  const { name, email, password, phone, category, profileImage } = req.body

  try {
    const updatedUser = await User.findByIdAndUpdate(adminId, { name, email, password, phone, profileImage }, { new: true })
    const updatedAdmin = await Admin.findOneAndUpdate({ userId: adminId }, { category }, { new: true })

    const response = {
      _id: updatedAdmin._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      profileImage: updatedUser.profileImage,
      role: updatedUser.role,
      category: updatedAdmin.category,
      profileImage: updatedUser.profileImage,
    }
    res.status(200).json({ message: "Admin updated successfully", response })
  } catch (error) {
    res.status(500).json({ message: "Failed to update admin", error })
  }
}

export const deleteAdmin = async (req, res) => {
  const { adminId } = req.params

  try {
    await User.findByIdAndDelete(adminId)
    await Admin.findOneAndDelete({ userId: adminId })
    res.status(200).json({ message: "Admin deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete admin", error })
  }
}

export const getDashboardStats = async (req, res) => {
  try {
    const totalAdmins = await Admin.countDocuments()
    const totalApiKeys = await ApiClient.countDocuments()
    const activeApiKeys = await ApiClient.countDocuments({ isActive: true })

    res.status(200).json({
      totalAdmins,
      totalApiKeys,
      activeApiKeys,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch dashboard stats", error })
  }
}
