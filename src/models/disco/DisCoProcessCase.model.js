/**
 * DisCo Process Case Model
 * Tracks disciplinary complaint processing before final DisCo action creation.
 */

import mongoose from "mongoose";

const StatementSchema = new mongoose.Schema(
  {
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    statementType: {
      type: String,
      enum: ["accused", "related"],
      required: true,
    },
    statementPdfUrl: {
      type: String,
      required: true,
      trim: true,
    },
    statementPdfName: {
      type: String,
      default: "statement.pdf",
      trim: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const EmailAttachmentSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ["initial_complaint", "statement", "extra"],
      default: "extra",
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const EmailLogSchema = new mongoose.Schema(
  {
    to: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    attachments: {
      type: [EmailAttachmentSchema],
      default: [],
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    result: {
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      errors: { type: [String], default: [] },
    },
  },
  { _id: true }
);

const TimelineEntrySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const DisCoProcessCaseSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    complaintPdfUrl: {
      type: String,
      required: true,
      trim: true,
    },
    complaintPdfName: {
      type: String,
      default: "complaint.pdf",
      trim: true,
    },
    caseStatus: {
      type: String,
      enum: [
        "submitted",
        "initial_rejected",
        "under_process",
        "final_rejected",
        "finalized_with_action",
      ],
      default: "submitted",
    },
    initialReview: {
      status: {
        type: String,
        enum: ["pending", "processed", "rejected"],
        default: "pending",
      },
      decisionDescription: {
        type: String,
        default: "",
        trim: true,
      },
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      decidedAt: {
        type: Date,
        default: null,
      },
    },
    statements: {
      type: [StatementSchema],
      default: [],
    },
    emailLogs: {
      type: [EmailLogSchema],
      default: [],
    },
    committeeMeetingMinutes: {
      pdfUrl: { type: String, default: "", trim: true },
      pdfName: { type: String, default: "", trim: true },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      uploadedAt: { type: Date, default: null },
    },
    finalDecision: {
      status: {
        type: String,
        enum: ["pending", "rejected", "action_taken"],
        default: "pending",
      },
      decisionDescription: {
        type: String,
        default: "",
        trim: true,
      },
      disciplinedStudentIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        default: [],
      },
      createdDisCoActionIds: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: "DisCoAction" }],
        default: [],
      },
      disciplinaryActionTemplate: {
        reason: { type: String, default: "", trim: true },
        actionTaken: { type: String, default: "", trim: true },
        date: { type: Date, default: null },
        remarks: { type: String, default: "", trim: true },
      },
      decidedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      decidedAt: {
        type: Date,
        default: null,
      },
    },
    timeline: {
      type: [TimelineEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

DisCoProcessCaseSchema.index({ submittedBy: 1, createdAt: -1 });
DisCoProcessCaseSchema.index({ caseStatus: 1, createdAt: -1 });

const DisCoProcessCase = mongoose.model("DisCoProcessCase", DisCoProcessCaseSchema);

export default DisCoProcessCase;
