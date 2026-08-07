/**
 * Attendance Queries Service
 * --------------------------
 * The single READ surface for the Student-Affairs attendance collections
 * (AttendanceOccurrence + AttendanceRecord). The attendance app-service reads
 * through these instead of importing the models, so both are touched only inside
 * `src/services/attendance/` (writes live in attendanceOwner.service.js).
 *
 * NOTE: the other models in models/attendance/ (CheckInOut, StaffAttendance,
 * Leave) are separate concerns (campus check-in, staff attendance/leave) with
 * their own callers and are NOT owned here.
 */

import { AttendanceOccurrence, AttendanceRecord } from "../../models/index.js"

const OCCURRENCE_POPULATE = [
  ["createdBy", "name email role"],
  ["assignedUsers", "name email role"],
]
const applyOccurrencePopulate = (q) =>
  OCCURRENCE_POPULATE.reduce((acc, [path, select]) => acc.populate(path, select), q)

export const attendanceQueries = {
  // ==================== AttendanceOccurrence ====================

  /** Occurrence list (filtered), newest first, populated + lean. */
  async listOccurrences(query = {}) {
    return applyOccurrencePopulate(AttendanceOccurrence.find(query).sort({ createdAt: -1 })).lean()
  },

  /** One occurrence, populated + lean (detail / post-write refetch). */
  async findOccurrenceByIdPopulated(id) {
    return applyOccurrencePopulate(AttendanceOccurrence.findById(id)).lean()
  },

  /** One occurrence, hydrated (mutate-then-persist + scan/mark access checks). */
  async findOccurrenceById(id) {
    return AttendanceOccurrence.findById(id)
  },

  /** One occurrence, lean (read-only access check, e.g. deleteRecord). */
  async findOccurrenceByIdLean(id) {
    return AttendanceOccurrence.findById(id).lean()
  },

  // ==================== AttendanceRecord ====================

  /** Present-count per occurrence for a set of ids -> [{ _id, count }]. */
  async aggregateRecordCountsByOccurrences(ids) {
    return AttendanceRecord.aggregate([
      { $match: { occurrenceId: { $in: ids } } },
      { $group: { _id: "$occurrenceId", count: { $sum: 1 } } },
    ])
  },

  /** All records for an occurrence, newest first, populated + lean. */
  async findRecordsByOccurrence(occurrenceId) {
    return AttendanceRecord.find({ occurrenceId })
      .sort({ scannedAt: -1 })
      .populate("userId", "name email profileImage")
      .populate("scannedBy", "name email")
      .lean()
  },

  /** A student's record for an occurrence (dedup lookup after a repeat scan). */
  async findRecordByOccurrenceAndStudent(occurrenceId, studentId) {
    return AttendanceRecord.findOne({ occurrenceId, studentId }).lean()
  },
}

export default attendanceQueries
