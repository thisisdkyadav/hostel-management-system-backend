import mongoose from "mongoose"

/**
 * One punch line from a machine's ATTLOG upload, exactly as received, plus what
 * HMS did with it. Unique per (machine, person, machine-local time) because a
 * machine re-sends a batch it did not get "OK" for.
 */
const IclockPunchSchema = new mongoose.Schema(
  {
    sn: { type: String, required: true },
    pin: { type: String, required: true },
    localTime: { type: String, required: true }, // "YYYY-MM-DD HH:mm:ss", machine clock
    punchedAt: { type: Date, required: true },
    status: { type: String, default: "" }, // punch state (0 = in, 1 = out, …)
    verify: { type: String, default: "" }, // verify type (15 = face, …)
    workCode: { type: String, default: "" },
    raw: { type: String, default: "" },
    receivedAt: { type: Date, default: Date.now },
    outcome: {
      processed: { type: Boolean, default: false },
      success: { type: Boolean, default: null },
      reason: { type: String, default: "" },
      message: { type: String, default: "" },
      ms: { type: Number, default: null },
    },
  },
  { timestamps: false },
)

IclockPunchSchema.index({ sn: 1, pin: 1, localTime: 1 }, { unique: true })
IclockPunchSchema.index({ receivedAt: -1 })
IclockPunchSchema.index({ pin: 1, punchedAt: -1 })

export default mongoose.models.IclockPunch || mongoose.model("IclockPunch", IclockPunchSchema)
