import mongoose from "mongoose"

const SessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, required: true, unique: true },
    userAgent: { type: String },
    ip: { type: String },
    loginTime: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now },
    deviceName: { type: String, default: "Unknown device" },
  },
  { timestamps: true }
)

// Index for fast lookup and TTL
SessionSchema.index({ userId: 1 })
SessionSchema.index({ sessionId: 1 }, { unique: true })
SessionSchema.index({ lastActive: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }) // 7 days

const Session = mongoose.model("UserSession", SessionSchema)

export default Session
