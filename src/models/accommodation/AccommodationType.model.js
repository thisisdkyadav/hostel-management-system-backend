/**
 * Accommodation Type Model
 *
 * Config row per accommodation category (parents-siblings, guest, intern...).
 * This is the extensibility lever: the front-half of the workflow (eligibility,
 * recommendation/approval chain, required docs, tariff overrides) is driven from
 * here, so a new category is mostly a new document, not new code. The back-half
 * (payment -> verify -> allot -> assign rooms -> invoice) is universal.
 */

import mongoose from "mongoose"

export const ACCOMMODATION_TYPE_KEYS = {
  PARENTS_SIBLINGS: "parents-siblings",
  GUEST: "guest",
  INTERN: "intern",
}

export const APPROVAL_STAGE_ACTIONS = {
  RECOMMEND: "recommend",
  APPROVE: "approve",
}

// One step in a type's approval chain. Steps run in array order.
const ApprovalStageSchema = new mongoose.Schema(
  {
    // Logical stage id, e.g. "facultyAdvisor", "chiefWarden".
    stage: { type: String, required: true },
    action: {
      type: String,
      enum: Object.values(APPROVAL_STAGE_ACTIONS),
      required: true,
    },
    // Admin sub-role expected to act at this stage (null for token-based stages).
    approverSubRole: { type: String, default: null },
    // Token-based stage handled by an emailed one-time link (e.g. Faculty Advisor).
    viaToken: { type: Boolean, default: false },
    // Skipped when its prerequisite is missing (e.g. no facultyAdvisorEmail).
    optional: { type: Boolean, default: false },
    // Auto-advance (approve) if no action within this many hours (null = never).
    autoAdvanceAfterHours: { type: Number, default: null },
  },
  { _id: false }
)

const AccommodationTypeSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true },

  // Eligibility
  eligibleRequesterRoles: { type: [String], default: ["Student"] },
  // Required requester email domain, e.g. "iiti.ac.in"; null = any.
  requesterEmailDomain: { type: String, default: null },

  approvalChain: { type: [ApprovalStageSchema], default: [] },

  // Document keys the requester must provide, e.g. ["addressProof"].
  requiredDocuments: { type: [String], default: [] },

  // Tariff overrides; null falls back to the `accommodation` settings config.
  feePerPersonPerNight: { type: Number, default: null },
  gstPercentage: { type: Number, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

AccommodationTypeSchema.pre("save", function () {
  this.updatedAt = Date.now()
})

const AccommodationType = mongoose.model("AccommodationType", AccommodationTypeSchema)
export default AccommodationType
