/**
 * Event Proposal Model
 * Detailed proposal submitted by GS 21 days before event
 */

import mongoose from "mongoose"

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
        "pending_joint_registrar",
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
    // Proposal details
    proposalText: { type: String, trim: true, required: true },
    proposalDocumentUrl: { type: String, trim: true },
    externalGuestsDetails: { type: String, trim: true },
    chiefGuestDocumentUrl: { type: String, trim: true },
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

const EventProposal = mongoose.model("EventProposal", EventProposalSchema)

export default EventProposal
