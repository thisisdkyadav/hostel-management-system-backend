import StaffAttendance from "../models/staffAttendance.js"
import User from "../models/User.js"
import Security from "../models/Security.js"
import { decryptData } from "../utils/qrUtils.js"

/**
 * Verify QR code for staff attendance
 * @param {Object} req - Request object with email and encrypted data
 * @param {Object} res - Response object
 */
export const verifyQR = async (req, res) => {
  const { email, encryptedData } = req.body

  try {
    if (!email || !encryptedData) {
      return res.status(400).json({ success: false, message: "Invalid QR Code data" })
    }

    // Find the user by email
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
    if (!user) {
      return res.status(400).json({ success: false, message: "Staff not found" })
    }

    // Verify user role is either Security or Maintenance
    if (user.role !== "Security" && user.role !== "Maintenance Staff") {
      return res.status(400).json({ success: false, message: "Invalid staff type" })
    }

    // Decrypt the data using the user's AES key
    const expiry = await decryptData(encryptedData, user.aesKey)
    if (!expiry) {
      return res.status(400).json({ success: false, message: "Invalid QR Code" })
    }

    // Check if QR code is expired (5 minutes expiry)
    if (Date.now() > expiry) {
      return res.status(400).json({ success: false, message: "QR Code Expired" })
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

    res.status(200).json({
      success: true,
      staffInfo,
      latestAttendance,
    })
  } catch (error) {
    console.error("Error verifying staff QR code:", error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}

/**
 * Record staff attendance (check-in or check-out)
 * @param {Object} req - Request object with email and attendance type
 * @param {Object} res - Response object
 */
export const recordAttendance = async (req, res) => {
  const { email, type } = req.body
  const reqUser = req.user

  try {
    if (!email || !type) {
      return res.status(400).json({ success: false, message: "Missing required fields" })
    }

    // Verify attendance type is either checkIn or checkOut
    if (type !== "checkIn" && type !== "checkOut") {
      return res.status(400).json({ success: false, message: "Invalid attendance type" })
    }

    // Find the user by email
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
    if (!user) {
      return res.status(400).json({ success: false, message: "Staff not found" })
    }

    // Verify user role is either Security or Maintenance
    if (user.role !== "Security" && user.role !== "Maintenance Staff") {
      return res.status(400).json({ success: false, message: "Invalid staff type" })
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

    res.status(201).json({
      success: true,
      message: `Staff ${type === "checkIn" ? "checked in" : "checked out"} successfully`,
      attendance,
    })
  } catch (error) {
    console.error("Error recording staff attendance:", error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}

/**
 * Get staff attendance records
 * @param {Object} req - Request object with optional filters
 * @param {Object} res - Response object
 */
export const getAttendanceRecords = async (req, res) => {
  const { staffType, userId, hostelId, startDate, endDate, page = 1, limit = 10 } = req.query
  console.log(userId)

  const user = req.user

  try {
    const query = {}

    // Apply filters
    if (userId) {
      query.userId = userId
    }

    if (hostelId) {
      query.hostelId = hostelId
    }

    if (staffType && !userId) {
      // We need to join with User model to filter by role
      const users = await User.find({ role: staffType === "security" ? "Security" : "Maintenance Staff" }).select("_id")
      query.userId = { $in: users.map((u) => u._id) }
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }

    // If user has hostel assignment, only show records for that hostel
    if (user.hostel) {
      query.hostelId = user.hostel._id
    }

    // Pagination
    const skip = (page - 1) * limit
    const total = await StaffAttendance.countDocuments(query)

    console.log(query)

    // Get records with pagination
    const records = await StaffAttendance.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate("userId", "name email role").populate("hostelId", "name type").exec()

    res.status(200).json({
      success: true,
      records,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching staff attendance records:", error)
    res.status(500).json({ success: false, message: "Internal server error" })
  }
}
