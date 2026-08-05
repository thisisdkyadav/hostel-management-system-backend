/**
 * AttendanceOccurrence Model
 * A Student Affairs attendance session (e.g. an event/meeting) for which
 * students are marked present by scanning their QR code.
 */

import mongoose from "mongoose"

const attendanceOccurrenceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    // Scheduled date/time of the occurrence (informational).
    startAt: {
      type: Date,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Users (Admin / Gymkhana) allowed to scan attendance for this occurrence.
    assignedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
    },
    // Expected roll numbers uploaded via CSV, used for absent/extra reconciliation.
    // Stored uppercased to match StudentProfile.rollNumber normalization.
    roster: {
      type: [String],
      default: [],
    },
    rosterUpdatedAt: {
      type: Date,
    },
  },
  { timestamps: true }
)

attendanceOccurrenceSchema.index({ createdBy: 1, createdAt: -1 })
attendanceOccurrenceSchema.index({ assignedUsers: 1, createdAt: -1 })
attendanceOccurrenceSchema.index({ status: 1, createdAt: -1 })

const AttendanceOccurrence = mongoose.model("AttendanceOccurrence", attendanceOccurrenceSchema)
export default AttendanceOccurrence
