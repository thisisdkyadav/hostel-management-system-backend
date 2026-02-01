/**
 * Feedback Token Model
 * One-time tokens for complaint feedback submission via email link
 */

import mongoose from "mongoose";
import crypto from "crypto";

const FeedbackTokenSchema = new mongoose.Schema({
  complaintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Complaint",
    required: true,
  },
  token: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString("hex"),
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  },
  used: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// TTL index - automatically delete expired tokens after 7 days past expiry
FeedbackTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 }
);

// Index for token lookups
FeedbackTokenSchema.index({ token: 1 });

// Index for finding tokens by complaint
FeedbackTokenSchema.index({ complaintId: 1 });

const FeedbackToken = mongoose.model("FeedbackToken", FeedbackTokenSchema);
export default FeedbackToken;
