import mongoose from "mongoose"

/**
 * A command queued for one machine. The machine picks it up on its next
 * getrequest poll ("C:<commandId>:<command>") and answers on devicecmd
 * ("ID=<commandId>&Return=<code>&CMD=<verb>"). Return 0 = success.
 */
export const ICLOCK_COMMAND_STATUSES = ["queued", "sent", "done", "failed"]

const IclockCommandSchema = new mongoose.Schema(
  {
    sn: { type: String, required: true },
    commandId: { type: Number, required: true },
    command: { type: String, required: true },
    status: { type: String, enum: ICLOCK_COMMAND_STATUSES, default: "queued" },
    returnCode: { type: Number, default: null },
    result: { type: String, default: "" },
    // An ERRORLOG the machine sent about this command after answering it (a Return=0 that failed later).
    machineError: {
      code: { type: String, default: "" },
      message: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    // What the command is about, so callers can find their answer (e.g. a roll number).
    ref: { kind: { type: String, default: "" }, key: { type: String, default: "" } },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    sentAt: { type: Date, default: null },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
)

IclockCommandSchema.index({ sn: 1, commandId: 1 }, { unique: true })
IclockCommandSchema.index({ sn: 1, status: 1, commandId: 1 })
IclockCommandSchema.index({ "ref.kind": 1, "ref.key": 1, createdAt: -1 })

export default mongoose.models.IclockCommand || mongoose.model("IclockCommand", IclockCommandSchema)
