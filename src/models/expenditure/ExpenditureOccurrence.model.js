/**
 * ExpenditureOccurrence Model
 * ---------------------------
 * A Student Affairs expenditure event/occurrence with a total budget, the
 * expenses incurred (each with its bills), payments received, and supporting
 * documents. Everything is embedded on the occurrence — the occurrence is the
 * single ownership unit and every entry can carry multiple PDF/image
 * attachments (stored as storage-backend "media://<uuid>" fileRefs).
 */

import mongoose from "mongoose"

// A single uploaded file (PDF or image). `fileRef` is the "media://<uuid>"
// reference returned by the upload endpoint; the bytes live in storage-backend.
const AttachmentSchema = new mongoose.Schema(
  {
    fileRef: { type: String, required: true, trim: true },
    originalName: { type: String, trim: true, default: "" },
    contentType: { type: String, trim: true, default: "" },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
)

// A bill / invoice proving (part of) an expense.
const BillSchema = new mongoose.Schema(
  {
    vendor: { type: String, trim: true, default: "" },
    billNumber: { type: String, trim: true, default: "" },
    amount: { type: Number, default: 0, min: 0 },
    billedAt: { type: Date },
    notes: { type: String, trim: true, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { _id: true, timestamps: true }
)

// A line of expenditure (money spent), with its bills + supporting files.
const ExpenseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, trim: true, default: "" },
    amount: { type: Number, required: true, default: 0, min: 0 },
    incurredAt: { type: Date },
    notes: { type: String, trim: true, default: "" },
    bills: { type: [BillSchema], default: [] },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { _id: true, timestamps: true }
)

// A payment received (money in) against this occurrence.
const PaymentSchema = new mongoose.Schema(
  {
    source: { type: String, trim: true, default: "" }, // who it was received from
    amount: { type: Number, required: true, default: 0, min: 0 },
    method: { type: String, trim: true, default: "" }, // cash / UPI / transfer ...
    receivedAt: { type: Date },
    reference: { type: String, trim: true, default: "" }, // txn / cheque reference
    notes: { type: String, trim: true, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },
  },
  { _id: true, timestamps: true }
)

const expenditureOccurrenceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    totalBudget: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["open", "closed"], default: "open" },
    expenses: { type: [ExpenseSchema], default: [] },
    payments: { type: [PaymentSchema], default: [] },
    // Occurrence-level supporting documents (not tied to a specific expense/payment).
    documents: { type: [AttachmentSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
)

expenditureOccurrenceSchema.index({ createdBy: 1, createdAt: -1 })
expenditureOccurrenceSchema.index({ status: 1, createdAt: -1 })

const ExpenditureOccurrence = mongoose.model("ExpenditureOccurrence", expenditureOccurrenceSchema)
export default ExpenditureOccurrence
