/**
 * AttendanceRecord Model
 * One record per student marked present for an AttendanceOccurrence.
 * Unique on (occurrenceId, studentId) so repeat scans are idempotent.
 */

import mongoose from "mongoose"

const attendanceRecordSchema = new mongoose.Schema(
  {
    occurrenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceOccurrence",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    // The student's User account (for name/photo display).
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Denormalized for fast roster reconciliation and display. Uppercased.
    rollNumber: {
      type: String,
      required: true,
    },
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    source: {
      type: String,
      enum: ["camera", "scanner", "manual"],
      default: "manual",
    },
    scannedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

// A student can only be marked present once per occurrence.
attendanceRecordSchema.index({ occurrenceId: 1, studentId: 1 }, { unique: true })
attendanceRecordSchema.index({ occurrenceId: 1, scannedAt: -1 })

const AttendanceRecord = mongoose.model("AttendanceRecord", attendanceRecordSchema)
export default AttendanceRecord
