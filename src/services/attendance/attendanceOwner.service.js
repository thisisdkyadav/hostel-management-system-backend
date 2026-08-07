/**
 * Attendance Owner Service
 * ------------------------
 * The single owner of all WRITES to the Student-Affairs attendance collections
 * (AttendanceOccurrence + AttendanceRecord). The attendance app-service creates
 * occurrences, marks students present, and deletes through here; nothing else
 * writes these collections.
 *
 * The concurrency-relevant write is marking a student present: the unique index
 * { occurrenceId, studentId } makes a repeat/concurrent scan idempotent. createRecord
 * catches the E11000 and reports { duplicate: true } so the caller can return
 * "Already marked present" instead of surfacing a raw duplicate-key error.
 *
 * Neither model has cross-model hooks.
 */

import { AttendanceOccurrence, AttendanceRecord } from "../../models/index.js"

const isDuplicateKeyError = (err) =>
  Boolean(err) && (err.code === 11000 || (typeof err.message === "string" && err.message.includes("E11000")))

export const attendanceOwner = {
  // ==================== AttendanceOccurrence ====================

  async createOccurrence(data) {
    return AttendanceOccurrence.create(data)
  },

  /** Persist a mutated hydrated occurrence (update / roster upload). */
  async persistOccurrence(occurrence) {
    await occurrence.save()
    return occurrence
  },

  /** Delete an occurrence and all its records (cascade). */
  async deleteOccurrenceById(id) {
    await AttendanceRecord.deleteMany({ occurrenceId: id })
    await AttendanceOccurrence.findByIdAndDelete(id)
  },

  // ==================== AttendanceRecord ====================

  /**
   * Mark a student present. Returns { ok: true, record } on insert, or
   * { ok: false, duplicate: true } when the unique (occurrenceId, studentId)
   * index rejects a repeat/concurrent scan — the caller then fetches the
   * existing record to report "already marked".
   */
  async createRecord(data) {
    try {
      const record = await AttendanceRecord.create(data)
      return { ok: true, record }
    } catch (err) {
      if (isDuplicateKeyError(err)) return { ok: false, duplicate: true }
      throw err
    }
  },

  /** Delete one record scoped to its occurrence; returns the deleted doc or null. */
  async deleteRecord({ recordId, occurrenceId }) {
    return AttendanceRecord.findOneAndDelete({ _id: recordId, occurrenceId })
  },
}

export default attendanceOwner
