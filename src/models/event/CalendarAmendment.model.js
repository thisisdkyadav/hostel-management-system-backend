/**
 * Calendar Amendment Model
 * Requests to edit or add events to approved calendar
 */

import mongoose from "mongoose"

const ProposedEventSchema = new mongoose.Schema({
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

const CalendarAmendmentSchema = new mongoose.Schema(
  {
    calendarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivityCalendar",
      required: true,
    },
    type: {
      type: String,
      enum: ["edit", "new_event"],
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GymkhanaEvent",
    }, // For edits
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    proposedChanges: ProposedEventSchema,
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: { type: Date },
    reviewComments: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Indexes
CalendarAmendmentSchema.index({ calendarId: 1 })
CalendarAmendmentSchema.index({ status: 1 })
CalendarAmendmentSchema.index({ requestedBy: 1 })

const CalendarAmendment = mongoose.model("CalendarAmendment", CalendarAmendmentSchema)

export default CalendarAmendment
