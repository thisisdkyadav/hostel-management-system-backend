import { staffAttendanceService } from './staff-attendance.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Verify QR code for staff attendance
 */
export const verifyQR = asyncHandler(async (req, res) => {
  const result = await staffAttendanceService.verifyQR(req.body);
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }
  res.status(result.statusCode).json({
    success: true,
    staffInfo: result.data.staffInfo,
    latestAttendance: result.data.latestAttendance,
  });
});

/**
 * Record staff attendance (check-in or check-out)
 */
export const recordAttendance = asyncHandler(async (req, res) => {
  const result = await staffAttendanceService.recordAttendance(req.body, req.user);
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }
  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    attendance: result.data.attendance,
  });
});

/**
 * Get staff attendance records
 */
export const getAttendanceRecords = asyncHandler(async (req, res) => {
  const result = await staffAttendanceService.getAttendanceRecords(req.query, req.user);
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }
  res.status(result.statusCode).json({
    success: true,
    records: result.data.records,
    meta: result.data.meta,
  });
});
