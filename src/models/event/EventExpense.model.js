/**
 * Event Expense Model
 * Post-event billing submitted by GS
 */

import mongoose from "mongoose"

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
      unique: true,
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
      enum: ["pending", "approved"],
      default: "pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: { type: Date, default: null },
    approvalComments: { type: String, trim: true, default: "" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Calculate totals before save
EventExpenseSchema.pre("save", function (next) {
  // Calculate total expenditure
  this.totalExpenditure = this.bills.reduce((sum, bill) => sum + (bill.amount || 0), 0)
  
  // Calculate variance if estimated budget exists
  if (this.estimatedBudget !== undefined) {
    this.budgetVariance = this.totalExpenditure - this.estimatedBudget
  }
  
  next()
})

// Indexes
EventExpenseSchema.index({ eventId: 1 })
EventExpenseSchema.index({ submittedBy: 1 })
EventExpenseSchema.index({ approvalStatus: 1 })

const EventExpense = mongoose.model("EventExpense", EventExpenseSchema)

export default EventExpense
