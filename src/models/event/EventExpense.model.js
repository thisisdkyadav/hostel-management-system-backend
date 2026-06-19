/**
 * Event Expense Model
 * Post-event billing submitted by GS
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

const BillSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  billNumber: { type: String, trim: true },
  billDate: { type: Date },
  vendor: { type: String, trim: true },
  attachments: [{
    filename: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  }],
})

const EventExpenseSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GymkhanaEvent",
      required: true,
      // Uniqueness enforced via a partial index below (excludes soft-deleted
      // rows) so a bill can be re-submitted after an admin soft-deletes one.
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bills: [BillSchema],
    eventReportDocumentUrl: { type: String, trim: true, default: "" },
    totalExpenditure: { type: Number, default: 0, min: 0 },
    estimatedBudget: { type: Number, min: 0 }, // From proposal
    budgetVariance: { type: Number }, // Calculated: totalExpenditure - estimatedBudget
    notes: { type: String, trim: true },
    approvalStatus: {
      type: String,
      enum: [
        "pending",
        "pending_student_affairs",
        "pending_officer",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
      ],
      default: "pending_student_affairs",
    },
    currentApprovalStage: {
      type: String,
      enum: [
        "Student Affairs",
        "Officer SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: "Student Affairs",
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

// Calculate totals before save
EventExpenseSchema.pre("save", function () {
  // Calculate total expenditure
  this.totalExpenditure = this.bills.reduce((sum, bill) => sum + (bill.amount || 0), 0)

  // Calculate variance if estimated budget exists
  if (this.estimatedBudget !== undefined) {
    this.budgetVariance = this.totalExpenditure - this.estimatedBudget
  }
})

// Indexes
EventExpenseSchema.index({ submittedBy: 1 })
EventExpenseSchema.index({ approvalStatus: 1 })
EventExpenseSchema.index({ isDeleted: 1 })
// One non-deleted bill per event. Partial filter lets a soft-deleted bill coexist
// with a freshly re-submitted one. Requires backfilling isDeleted on existing
// docs + dropping the old `eventId_1` unique index (see migration note in PR).
EventExpenseSchema.index(
  { eventId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
)

// Soft-delete guard: exclude deleted docs from all normal reads. Callers that
// genuinely need deleted docs opt in via query option { withDeleted: true } or
// by referencing `isDeleted` in their own filter (e.g. restore).
EventExpenseSchema.pre(/^find/, function () {
  const filter = this.getFilter()
  if (!("isDeleted" in filter) && !this.getOptions().withDeleted) {
    this.where({ isDeleted: { $ne: true } })
  }
})

const EventExpense = mongoose.model("EventExpense", EventExpenseSchema)

export default EventExpense
