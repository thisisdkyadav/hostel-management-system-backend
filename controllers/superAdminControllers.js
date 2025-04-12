import ApiClient from "../models/ApiClient.js"
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
  const { name, expiresAt } = req.body

  try {
    const updatedClient = await ApiClient.findByIdAndUpdate(clientId, { name, expiresAt }, { new: true })
    res.status(200).json({ message: "API client updated successfully", updatedClient })
  } catch (error) {
    res.status(500).json({ message: "Failed to update API client", error })
  }
}
