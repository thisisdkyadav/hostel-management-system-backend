/**
 * Activity Calendar Model
 * Annual master calendar created by Admin, editable by GS when unlocked
 */

import mongoose from "mongoose"

const CalendarEventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ["academic", "cultural", "sports", "technical"],
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  estimatedBudget: { type: Number, required: true, min: 0 },
  description: { type: String, required: true, trim: true },
})

const ActivityCalendarSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-\d{2}$/, // Format: 2025-26
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending_president",
        "pending_student_affairs",
        "pending_joint_registrar",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
      ],
      default: "draft",
    },
    currentApprovalStage: {
      type: String,
      enum: [
        "GS Gymkhana",
        "President Gymkhana",
        "Student Affairs",
        "Joint Registrar SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: null,
    },
    customApprovalChain: [
      {
        type: String,
        enum: ["Joint Registrar SA", "Associate Dean SA", "Dean SA"],
      },
    ],
    currentChainIndex: { type: Number, default: null },
    events: [CalendarEventSchema],
    rejectionReason: { type: String },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedAt: { type: Date },
    approvedAt: { type: Date },
    // Lock fields - Admin controls when calendar can be edited
    isLocked: { type: Boolean, default: false },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lockedAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Index for quick lookup
ActivityCalendarSchema.index({ academicYear: 1 })
ActivityCalendarSchema.index({ status: 1 })
ActivityCalendarSchema.index({ createdBy: 1 })

const ActivityCalendar = mongoose.model("ActivityCalendar", ActivityCalendarSchema)

export default ActivityCalendar
