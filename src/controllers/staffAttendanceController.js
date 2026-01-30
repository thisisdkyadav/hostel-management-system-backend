import { staffAttendanceService } from "../services/staffAttendance.service.js"

/**
 * Verify QR code for staff attendance
 * @param {Object} req - Request object with email and encrypted data
 * @param {Object} res - Response object
 */
export const verifyQR = async (req, res) => {
  const result = await staffAttendanceService.verifyQR(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message })
  }
  res.status(result.statusCode).json({
    success: true,
    staffInfo: result.data.staffInfo,
    latestAttendance: result.data.latestAttendance,
  })
}

/**
 * Record staff attendance (check-in or check-out)
 * @param {Object} req - Request object with email and attendance type
 * @param {Object} res - Response object
 */
export const recordAttendance = async (req, res) => {
  const result = await staffAttendanceService.recordAttendance(req.body, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message })
  }
  res.status(result.statusCode).json({
    success: true,
    message: result.data.message,
    attendance: result.data.attendance,
  })
}

/**
 * Get staff attendance records
 * @param {Object} req - Request object with optional filters
 * @param {Object} res - Response object
 */
export const getAttendanceRecords = async (req, res) => {
  const result = await staffAttendanceService.getAttendanceRecords(req.query, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message })
  }
  res.status(result.statusCode).json({
    success: true,
    records: result.data.records,
    meta: result.data.meta,
  })
}
