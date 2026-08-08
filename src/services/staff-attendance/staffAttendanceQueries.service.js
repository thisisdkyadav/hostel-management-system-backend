/**
 * Staff Attendance Queries Service
 * --------------------------------
 * The single READ surface for the StaffAttendance collection. The
 * staff-attendance app-service reads through these instead of importing the
 * model, so StaffAttendance is touched only inside `src/services/staff-attendance/`
 * (writes live in staffAttendanceOwner.service.js).
 */

import { StaffAttendance } from "../../models/index.js"

export const staffAttendanceQueries = {
  /** The user's most recent attendance event (verifyQR latest status). */
  async findLatestByUser(userId) {
    return StaffAttendance.findOne({ userId }).sort({ createdAt: -1 })
  },

  /** Count records matching a filter (pagination total). */
  async countAttendance(filter = {}) {
    return StaffAttendance.countDocuments(filter)
  },

  /** Paginated attendance records, newest first, populated. */
  async listAttendance(filter = {}, { skip = 0, limit = 10 } = {}) {
    return StaffAttendance.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email role")
      .populate("hostelId", "name type")
  },
}

export default staffAttendanceQueries
