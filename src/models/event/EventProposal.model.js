/**
 * Event Proposal Model
 * Detailed proposal submitted by GS 60 days before event
 */

import mongoose from "mongoose"

const APPROVER_ASSIGNMENT_SCHEMA = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: ["Officer SA", "Associate Dean SA", "Dean SA"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
)

const EventProposalSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GymkhanaEvent",
      required: true,
    },
    submittedBy: {
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
        "pending_officer",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
        "revision_requested",
      ],
      default: "draft",
    },
    currentApprovalStage: {
      type: String,
      enum: [
        "GS Gymkhana",
        "President Gymkhana",
        "Student Affairs",
        "Officer SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: null,
    },
    customApprovalChain: [
      {
        type: String,
        enum: ["Officer SA", "Associate Dean SA", "Dean SA"],
      },
    ],
    currentChainIndex: { type: Number, default: null },
    customApprovalAssignments: {
      type: [APPROVER_ASSIGNMENT_SCHEMA],
      default: [],
    },
    currentApproverUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Proposal details
    proposalText: { type: String, trim: true, required: true },
    proposalDocumentUrl: { type: String, trim: true },
    externalGuestsDetails: { type: String, trim: true },
    chiefGuestDocumentUrl: { type: String, trim: true },
    proposalDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    accommodationRequired: { type: Boolean, default: false },
    hasRegistrationFee: { type: Boolean, default: false },
    registrationFeeAmount: { type: Number, min: 0, default: 0 },
    totalExpectedIncome: { type: Number, min: 0, default: 0 },
    totalExpenditure: { type: Number, min: 0, required: true },
    budgetDeflection: { type: Number, default: 0 }, // totalExpenditure - eventBudgetAtSubmission
    eventBudgetAtSubmission: { type: Number, min: 0, default: 0 },
    
    // Rejection info
    rejectionReason: { type: String },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedAt: { type: Date },
    approvedAt: { type: Date },
    
    // Revision tracking
    revisionCount: { type: Number, default: 0 },

    // Soft delete (admin override)
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deleteReason: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Indexes
EventProposalSchema.index({ eventId: 1 })
EventProposalSchema.index({ status: 1 })
EventProposalSchema.index({ submittedBy: 1 })
EventProposalSchema.index({ isDeleted: 1 })

// Soft-delete guard: exclude deleted docs from all normal reads. Callers that
// genuinely need deleted docs opt in via query option { withDeleted: true } or
// by referencing `isDeleted` in their own filter (e.g. restore).
EventProposalSchema.pre(/^find/, function () {
  const filter = this.getFilter()
  if (!("isDeleted" in filter) && !this.getOptions().withDeleted) {
    this.where({ isDeleted: { $ne: true } })
  }
})

const EventProposal = mongoose.model("EventProposal", EventProposalSchema)

export default EventProposal
