import StaffAttendance from "../../models/staffAttendance.js"
import User from "../../models/User.js"
import Security from "../../models/Security.js"
import { decryptData } from "../../utils/qrUtils.js"

class StaffAttendanceService {
  async verifyQR(data) {
    const { email, encryptedData } = data

    try {
      if (!email || !encryptedData) {
        return { success: false, statusCode: 400, message: "Invalid QR Code data" }
      }

      // Find the user by email
      const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
      if (!user) {
        return { success: false, statusCode: 400, message: "Staff not found" }
      }

      // Verify user role is either Security or Maintenance
      if (user.role !== "Security" && user.role !== "Maintenance Staff") {
        return { success: false, statusCode: 400, message: "Invalid staff type" }
      }

      // Decrypt the data using the user's AES key
      const expiry = await decryptData(encryptedData, user.aesKey)
      if (!expiry) {
        return { success: false, statusCode: 400, message: "Invalid QR Code" }
      }

      // Check if QR code is expired (5 minutes expiry)
      if (Date.now() > expiry) {
        return { success: false, statusCode: 400, message: "QR Code Expired" }
      }

      // Determine staff type based on user role
      const staffType = user.role === "Security" ? "security" : "maintenance"

      // Get staff info
      let staffInfo = {
        _id: user._id,
        name: user.name,
        email: user.email,
        staffType: staffType,
        role: user.role,
      }

      // Get hostel assignment if it's security staff
      if (staffType === "security") {
        const securityProfile = await Security.findOne({ userId: user._id }).populate("hostelId", "name type").exec()

        if (securityProfile && securityProfile.hostelId) {
          staffInfo.hostelId = securityProfile.hostelId._id
          staffInfo.hostelName = securityProfile.hostelId.name
        }
      }

      // Get the latest attendance record for the staff
      const latestAttendance = await StaffAttendance.findOne({ userId: user._id }).sort({ createdAt: -1 }).exec()

      return {
        success: true,
        statusCode: 200,
        data: { staffInfo, latestAttendance },
      }
    } catch (error) {
      console.error("Error verifying staff QR code:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async recordAttendance(data, reqUser) {
    const { email, type } = data

    try {
      if (!email || !type) {
        return { success: false, statusCode: 400, message: "Missing required fields" }
      }

      // Verify attendance type is either checkIn or checkOut
      if (type !== "checkIn" && type !== "checkOut") {
        return { success: false, statusCode: 400, message: "Invalid attendance type" }
      }

      // Find the user by email
      const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
      if (!user) {
        return { success: false, statusCode: 400, message: "Staff not found" }
      }

      // Verify user role is either Security or Maintenance
      if (user.role !== "Security" && user.role !== "Maintenance Staff") {
        return { success: false, statusCode: 400, message: "Invalid staff type" }
      }

      // Determine staff type based on user role
      const staffType = user.role === "Security" ? "security" : "maintenance"

      // Get hostel ID for the staff member
      let hostelId = reqUser.hostel._id

      // Create new attendance record
      const attendance = new StaffAttendance({
        userId: user._id,
        hostelId,
        type,
      })

      await attendance.save()

      return {
        success: true,
        statusCode: 201,
        data: {
          message: `Staff ${type === "checkIn" ? "checked in" : "checked out"} successfully`,
          attendance,
        },
      }
    } catch (error) {
      console.error("Error recording staff attendance:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async getAttendanceRecords(query, user) {
    const { staffType, userId, hostelId, startDate, endDate, page = 1, limit = 10 } = query
    console.log(userId)

    try {
      const queryObj = {}

      // Apply filters
      if (userId) {
        queryObj.userId = userId
      }

      if (hostelId) {
        queryObj.hostelId = hostelId
      }

      if (staffType && !userId) {
        // We need to join with User model to filter by role
        const users = await User.find({ role: staffType === "security" ? "Security" : "Maintenance Staff" }).select("_id")
        queryObj.userId = { $in: users.map((u) => u._id) }
      }

      // Date range filter
      if (startDate || endDate) {
        queryObj.createdAt = {}
        if (startDate) {
          queryObj.createdAt.$gte = new Date(startDate)
        }
        if (endDate) {
          queryObj.createdAt.$lte = new Date(endDate)
        }
      }

      // If user has hostel assignment, only show records for that hostel
      if (user.hostel) {
        queryObj.hostelId = user.hostel._id
      }

      // Pagination
      const skip = (page - 1) * limit
      const total = await StaffAttendance.countDocuments(queryObj)

      console.log(queryObj)

      // Get records with pagination
      const records = await StaffAttendance.find(queryObj).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate("userId", "name email role").populate("hostelId", "name type").exec()

      return {
        success: true,
        statusCode: 200,
        data: {
          records,
          meta: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
          },
        },
      }
    } catch (error) {
      console.error("Error fetching staff attendance records:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }
}

export const staffAttendanceService = new StaffAttendanceService()
