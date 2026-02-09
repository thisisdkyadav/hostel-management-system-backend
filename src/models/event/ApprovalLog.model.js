/**
 * Approval Log Model
 * Complete audit trail for all approvals/rejections
 */

import mongoose from "mongoose"

const ApprovalLogSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ["ActivityCalendar", "EventProposal", "CalendarAmendment"],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "entityType",
    },
    stage: {
      type: String,
      enum: [
        "GS Gymkhana",
        "President Gymkhana",
        "Student Affairs",
        "Joint Registrar SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      required: true,
    },
    action: {
      type: String,
      enum: ["submitted", "approved", "rejected", "revision_requested"],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comments: { type: String, trim: true },
    attachments: [{
      filename: { type: String, required: true },
      url: { type: String, required: true },
    }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Indexes for efficient querying
ApprovalLogSchema.index({ entityType: 1, entityId: 1 })
ApprovalLogSchema.index({ performedBy: 1 })
ApprovalLogSchema.index({ createdAt: -1 })

const ApprovalLog = mongoose.model("ApprovalLog", ApprovalLogSchema)

export default ApprovalLog
