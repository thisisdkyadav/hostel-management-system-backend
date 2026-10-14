import mongoose from "mongoose"
// One summary email per internal recipient for a bulk H4 action; the matching
// per-request notification jobs skip internal recipients (internalDigest).
const schema = new mongoose.Schema(
  {
    requestIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "AccommodationRequest" }],
    note: { type: String, default: "" },
    pending: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
)
schema.index({ pending: 1, nextAttemptAt: 1, leaseUntil: 1 })
export default mongoose.model("AccommodationDigest", schema)
