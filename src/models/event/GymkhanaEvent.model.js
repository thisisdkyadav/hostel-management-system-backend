/**
 * Gymkhana Event Model
 * Individual events extracted from approved Activity Calendar
 * (Named differently from hostel Event model to avoid conflicts)
 */

import mongoose from "mongoose"

const GymkhanaEventSchema = new mongoose.Schema(
  {
    calendarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ActivityCalendar",
      default: null,
    },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["academic", "cultural", "sports", "technical"],
      required: true,
    },
    scheduledStartDate: { type: Date, required: true },
    scheduledEndDate: { type: Date, required: true },
    estimatedBudget: { type: Number, required: true, min: 0 },
    description: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: [
        "upcoming",
        "proposal_pending",
        "proposal_submitted",
        "proposal_approved",
        "completed",
        "cancelled",
      ],
      default: "upcoming",
    },
    proposalDueDate: { type: Date }, // scheduledStartDate - 21 days
    proposalSubmitted: { type: Boolean, default: false },
    proposalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventProposal",
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventExpense",
    },
    isMegaEvent: { type: Boolean, default: false },
    megaEventSeriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MegaEventSeries",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Calculate proposal due date (21 days before event start)
GymkhanaEventSchema.pre("save", function (next) {
  if (this.scheduledStartDate && (this.isModified("scheduledStartDate") || !this.proposalDueDate)) {
    const dueDate = new Date(this.scheduledStartDate)
    dueDate.setDate(dueDate.getDate() - 21)
    this.proposalDueDate = dueDate
  }
  next()
})

// Virtual to check if proposal is overdue
GymkhanaEventSchema.virtual("isProposalOverdue").get(function () {
  if (this.proposalSubmitted) return false
  return new Date() > this.proposalDueDate
})

// Indexes
GymkhanaEventSchema.index({ calendarId: 1 })
GymkhanaEventSchema.index({ isMegaEvent: 1 })
GymkhanaEventSchema.index({ megaEventSeriesId: 1 })
GymkhanaEventSchema.index({ status: 1 })
GymkhanaEventSchema.index({ scheduledStartDate: 1 })
GymkhanaEventSchema.index({ scheduledEndDate: 1 })
GymkhanaEventSchema.index({ proposalDueDate: 1 })

const GymkhanaEvent = mongoose.model("GymkhanaEvent", GymkhanaEventSchema)

export default GymkhanaEvent
