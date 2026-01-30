import HostelGate from "../../models/HostelGate.js"
import Hostel from "../../models/Hostel.js"
import User from "../../models/User.js"
import bcrypt from "bcrypt"

class HostelGateService {
  async createHostelGate(data) {
    const { hostelId, password } = data
    try {
      const hostel = await Hostel.findById(hostelId)

      if (!hostel) {
        return { success: false, statusCode: 404, message: "Hostel not found" }
      }

      const existingHostelGate = await HostelGate.findOne({ hostelId })
      if (existingHostelGate) {
        return { success: false, statusCode: 400, message: "Hostel gate already exists" }
      }

      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)

      // create a new user
      const user = await User.create({
        name: hostel.name,
        email: `${hostel.name.toLowerCase()}.gate.login@iiti.ac.in`,
        password: hashedPassword,
        role: "Hostel Gate",
      })

      const savedUser = await user.save()

      const hostelGate = await HostelGate.create({ userId: savedUser._id, hostelId })
      return { success: true, statusCode: 201, data: { message: "Hostel gate created successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message }
    }
  }

  async getAllHostelGates() {
    try {
      const hostelGates = await HostelGate.find()
        .populate({
          path: "userId",
          select: "name email",
        })
        .populate({
          path: "hostelId",
          select: "name",
        })
      return { success: true, statusCode: 200, data: { hostelGates } }
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message }
    }
  }

  async updateHostelGate(hostelId, data) {
    try {
      const { password } = data
      const hostelGate = await HostelGate.findOne({ hostelId })
      if (!hostelGate) {
        return { success: false, statusCode: 404, message: "Hostel gate not found" }
      }
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)
      hostelGate.password = hashedPassword
      await hostelGate.save()
      return { success: true, statusCode: 200, data: { message: "Hostel gate updated successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message }
    }
  }

  async deleteHostelGate(hostelId) {
    try {
      const hostelGate = await HostelGate.findOne({ hostelId })
      if (!hostelGate) {
        return { success: false, statusCode: 404, message: "Hostel gate not found" }
      }
      await hostelGate.deleteOne()
      return { success: true, statusCode: 200, data: { message: "Hostel gate deleted successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message }
    }
  }

  async getHostelGateProfile(hostelId) {
    try {
      const hostelGate = await HostelGate.findOne({ hostelId })
      if (!hostelGate) {
        return { success: false, statusCode: 404, message: "Hostel gate not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Hostel gate profile fetched successfully", hostelGate } }
    } catch (error) {
      return { success: false, statusCode: 500, message: error.message }
    }
  }
}

export const hostelGateService = new HostelGateService()
