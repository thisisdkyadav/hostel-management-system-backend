import ApiClient from "../models/ApiClient.js"
import User from "../models/User.js"
import crypto from "crypto"

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
  const { name, email, password, phone } = req.body

  if (!name || !email) {
    return res.status(400).json({ message: "Name and email are required" })
  }

  try {
    const newAdmin = new User({
      name,
      email,
      role: "Admin",
      password,
      phone,
    })
    await newAdmin.save()
    res.status(201).json({ message: "Admin created successfully", adminId: newAdmin._id })
  } catch (error) {
    res.status(500).json({ message: "Failed to create admin", error })
  }
}

export const getAdmins = async (req, res) => {
  try {
    const admins = await User.find({ role: "Admin" }).select("-password -__v")
    res.status(200).json(admins)
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch admins", error })
  }
}

export const updateAdmin = async (req, res) => {
  const { adminId } = req.params
  const { name, email, password, phone } = req.body

  try {
    const updatedAdmin = await User.findByIdAndUpdate(adminId, { name, email, password, phone }, { new: true })
    res.status(200).json({ message: "Admin updated successfully", updatedAdmin })
  } catch (error) {
    res.status(500).json({ message: "Failed to update admin", error })
  }
}

export const deleteAdmin = async (req, res) => {
  const { adminId } = req.params

  try {
    await User.findByIdAndDelete(adminId)
    res.status(200).json({ message: "Admin deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete admin", error })
  }
}

export const getDashboardStats = async (req, res) => {
  try {
    const totalAdmins = await User.countDocuments({ role: "Admin" })
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
