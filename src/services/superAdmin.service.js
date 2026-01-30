import ApiClient from "../../models/ApiClient.js"
import User from "../../models/User.js"
import crypto from "crypto"
import bcrypt from "bcrypt"
import Admin from "../../models/Admin.js"

class SuperAdminService {
  async createApiClient(data) {
    const { name, expiresAt } = data

    if (!name) {
      return { success: false, statusCode: 400, message: "Name is required" }
    }

    try {
      const apiKey = crypto.randomBytes(32).toString("hex")
      const newClient = new ApiClient({
        name,
        apiKey,
        expiresAt,
      })
      await newClient.save()
      return { success: true, statusCode: 201, data: { message: "API client created successfully", clientId: newClient._id, apiKey } }
    } catch (error) {
      if (error.code === 11000) {
        return { success: false, statusCode: 409, message: "API client with this name already exists" }
      }
      return { success: false, statusCode: 500, message: "Failed to create API client", error }
    }
  }

  async getApiClients() {
    try {
      const clients = await ApiClient.find()
      return { success: true, statusCode: 200, data: clients }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to fetch API clients", error }
    }
  }

  async deleteApiClient(clientId) {
    try {
      await ApiClient.findByIdAndDelete(clientId)
      return { success: true, statusCode: 200, data: { message: "API client deleted successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to delete API client", error }
    }
  }

  async updateApiClient(clientId, data) {
    const { name, expiresAt, isActive } = data
    try {
      const updatedClient = await ApiClient.findByIdAndUpdate(clientId, { name, expiresAt, isActive }, { new: true })
      return { success: true, statusCode: 200, data: { message: "API client updated successfully", updatedClient } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to update API client", error }
    }
  }

  async createAdmin(data) {
    const { name, email, password, phone, category } = data

    if (!name || !email) {
      return { success: false, statusCode: 400, message: "Name and email are required" }
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

      return { success: true, statusCode: 201, data: { message: "Admin created successfully", adminId: newAdmin._id } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to create admin", error }
    }
  }

  async getAdmins() {
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
      return { success: true, statusCode: 200, data: response }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to fetch admins", error }
    }
  }

  async updateAdmin(adminId, data) {
    const { name, email, password, phone, category, profileImage } = data

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
      }
      return { success: true, statusCode: 200, data: { message: "Admin updated successfully", response } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to update admin", error }
    }
  }

  async deleteAdmin(adminId) {
    try {
      await User.findByIdAndDelete(adminId)
      await Admin.findOneAndDelete({ userId: adminId })
      return { success: true, statusCode: 200, data: { message: "Admin deleted successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to delete admin", error }
    }
  }

  async getDashboardStats() {
    try {
      const totalAdmins = await Admin.countDocuments()
      const totalApiKeys = await ApiClient.countDocuments()
      const activeApiKeys = await ApiClient.countDocuments({ isActive: true })

      return {
        success: true,
        statusCode: 200,
        data: {
          totalAdmins,
          totalApiKeys,
          activeApiKeys,
        },
      }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Failed to fetch dashboard stats", error }
    }
  }
}

export const superAdminService = new SuperAdminService()
