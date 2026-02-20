/**
 * Mega Event Occurrence Model
 * Stores one occurrence with embedded proposal and expense approval flows.
 */

import mongoose from "mongoose"

const APPROVAL_STAGES = [
  "GS Gymkhana",
  "President Gymkhana",
  "Student Affairs",
  "Joint Registrar SA",
  "Associate Dean SA",
  "Dean SA",
]

const POST_STUDENT_AFFAIRS_APPROVERS = [
  "Joint Registrar SA",
  "Associate Dean SA",
  "Dean SA",
]

const APPROVAL_ACTIONS = ["submitted", "approved", "rejected", "revision_requested"]

const historyEntrySchema = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: APPROVAL_STAGES,
      required: true,
    },
    action: {
      type: String,
      enum: APPROVAL_ACTIONS,
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    comments: {
      type: String,
      trim: true,
      default: "",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
)

const billSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    billNumber: { type: String, trim: true, default: "" },
    billDate: { type: Date, default: null },
    vendor: { type: String, trim: true, default: "" },
    attachments: [
      {
        filename: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    _id: true,
  }
)

const proposalSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending_student_affairs",
        "pending_joint_registrar",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
        "revision_requested",
      ],
      default: "pending_student_affairs",
    },
    currentApprovalStage: {
      type: String,
      enum: [
        "President Gymkhana",
        "Student Affairs",
        "Joint Registrar SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: "Student Affairs",
    },
    customApprovalChain: [
      {
        type: String,
        enum: POST_STUDENT_AFFAIRS_APPROVERS,
      },
    ],
    currentChainIndex: { type: Number, default: null },
    proposalText: { type: String, trim: true, required: true },
    proposalDocumentUrl: { type: String, trim: true, default: "" },
    externalGuestsDetails: { type: String, trim: true, default: "" },
    chiefGuestDocumentUrl: { type: String, trim: true, default: "" },
    proposalDetails: { type: mongoose.Schema.Types.Mixed, default: null },
    accommodationRequired: { type: Boolean, default: false },
    hasRegistrationFee: { type: Boolean, default: false },
    registrationFeeAmount: { type: Number, min: 0, default: 0 },
    totalExpectedIncome: { type: Number, min: 0, default: 0 },
    totalExpenditure: { type: Number, min: 0, required: true },
    budgetDeflection: { type: Number, default: 0 },
    eventBudgetAtSubmission: { type: Number, min: 0, default: 0 },
    rejectionReason: { type: String, trim: true, default: "" },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    revisionCount: { type: Number, default: 0 },
    history: [historyEntrySchema],
  },
  {
    _id: true,
  }
)

const expenseSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bills: {
      type: [billSchema],
      default: [],
    },
    eventReportDocumentUrl: { type: String, trim: true, default: "" },
    totalExpenditure: { type: Number, min: 0, default: 0 },
    estimatedBudget: { type: Number, min: 0, default: 0 },
    budgetVariance: { type: Number, default: 0 },
    notes: { type: String, trim: true, default: "" },
    approvalStatus: {
      type: String,
      enum: [
        "pending_student_affairs",
        "pending_joint_registrar",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
      ],
      default: "pending_student_affairs",
    },
    currentApprovalStage: {
      type: String,
      enum: ["Student Affairs", "Joint Registrar SA", "Associate Dean SA", "Dean SA"],
      default: "Student Affairs",
    },
    customApprovalChain: [
      {
        type: String,
        enum: POST_STUDENT_AFFAIRS_APPROVERS,
      },
    ],
    currentChainIndex: { type: Number, default: null },
    rejectionReason: { type: String, trim: true, default: "" },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: { type: Date, default: null },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    approvalComments: { type: String, trim: true, default: "" },
    history: [historyEntrySchema],
  },
  {
    _id: true,
  }
)

const MegaEventOccurrenceSchema = new mongoose.Schema(
  {
    seriesId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MegaEventSeries",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    category: {
      type: String,
      enum: ["academic", "cultural", "sports", "technical"],
      default: "cultural",
    },
    scheduledStartDate: { type: Date, required: true },
    scheduledEndDate: { type: Date, required: true },
    status: {
      type: String,
      enum: [
        "proposal_pending",
        "proposal_submitted",
        "proposal_approved",
        "completed",
        "cancelled",
      ],
      default: "proposal_pending",
    },
    proposalDueDate: { type: Date },
    proposalSubmitted: { type: Boolean, default: false },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    proposal: {
      type: proposalSchema,
      default: null,
    },
    expense: {
      type: expenseSchema,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

MegaEventOccurrenceSchema.pre("save", function (next) {
  if (this.scheduledStartDate && (this.isModified("scheduledStartDate") || !this.proposalDueDate)) {
    const dueDate = new Date(this.scheduledStartDate)
    dueDate.setDate(dueDate.getDate() - 21)
    this.proposalDueDate = dueDate
  }

  if (this.expense && Array.isArray(this.expense.bills)) {
    const total = this.expense.bills.reduce((sum, bill) => sum + Number(bill?.amount || 0), 0)
    this.expense.totalExpenditure = total
    const estimated = Number(this.expense.estimatedBudget || 0)
    this.expense.budgetVariance = total - estimated
  }

  next()
})

MegaEventOccurrenceSchema.index({ seriesId: 1 })
MegaEventOccurrenceSchema.index({ status: 1 })
MegaEventOccurrenceSchema.index({ scheduledStartDate: 1 })
MegaEventOccurrenceSchema.index({ scheduledEndDate: 1 })
MegaEventOccurrenceSchema.index({ proposalDueDate: 1 })

const MegaEventOccurrence = mongoose.model("MegaEventOccurrence", MegaEventOccurrenceSchema)

export default MegaEventOccurrence
