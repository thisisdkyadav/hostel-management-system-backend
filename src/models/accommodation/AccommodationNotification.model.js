import mongoose from "mongoose"
const schema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "AccommodationRequest", required: true, unique: true },
    revision: { type: Number, default: 0 },
    pending: { type: Boolean, default: true },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: { type: Date, default: null },
    lastError: { type: String, default: "" },
  },
  { timestamps: true },
)
schema.index({ pending: 1, nextAttemptAt: 1, leaseUntil: 1 })
export default mongoose.model("AccommodationNotification", schema)
