import mongoose from "mongoose"

/**
 * Short-lived log of raw machine traffic (kept 14 days) so protocol problems
 * can be diagnosed from HMS without packet captures. Bodies are truncated.
 */
const IclockRequestLogSchema = new mongoose.Schema({
  sn: { type: String, default: "" },
  method: { type: String, default: "" },
  path: { type: String, default: "" },
  query: { type: String, default: "" },
  bodyBytes: { type: Number, default: 0 },
  body: { type: String, default: "" },
  status: { type: Number, default: 200 },
  response: { type: String, default: "" },
  ms: { type: Number, default: null },
  at: { type: Date, default: Date.now },
})

IclockRequestLogSchema.index({ at: 1 }, { expireAfterSeconds: 14 * 24 * 3600 })
IclockRequestLogSchema.index({ sn: 1, at: -1 })

export default mongoose.models.IclockRequestLog || mongoose.model("IclockRequestLog", IclockRequestLogSchema)
