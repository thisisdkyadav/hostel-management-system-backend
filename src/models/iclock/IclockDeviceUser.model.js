import mongoose from "mongoose"

/**
 * One person on one face machine, as HMS believes it to be. This is how the
 * roster sync knows what to add, re-photo or remove without asking the machine
 * every time.
 *
 * source — how HMS learned the person is there:
 *   easywdms — seeded from the EasyWDMS employee list when sync was switched on
 *   machine  — the machine reported them (USER record in an upload)
 *   hms      — HMS added them
 * faceSha — sha256 of the photo HMS believes the machine has ("" = unknown/none).
 * pending — commands in flight for this person; cleared as the machine answers.
 * lastResult.faceSha — the photo that answer was about: a photo a machine refused
 *   isn't sent to that machine again until HMS has a different one.
 * lastResult.error / message — the machine's own error (ERRORLOG ErrCode) when it
 *   took the photo (Return=0) but then couldn't use it; commandId — which command.
 * machinePhoto — the photo the MACHINE holds, as it last uploaded it (answer to
 *   DATA QUERY BIOPHOTO). The file is kept on disk (one per machine+person,
 *   overwritten); sameAsHms = byte-identical to the HMS face that was sent.
 */
export const ICLOCK_ROSTER_SOURCES = ["easywdms", "machine", "hms"]
export const ICLOCK_ROSTER_OPS = ["add", "face", "remove"]

const IclockDeviceUserSchema = new mongoose.Schema(
  {
    sn: { type: String, required: true },
    pin: { type: String, required: true },
    name: { type: String, default: "" },
    onMachine: { type: Boolean, default: false },
    source: { type: String, enum: [...ICLOCK_ROSTER_SOURCES, ""], default: "" },
    faceSha: { type: String, default: "" },
    pending: {
      op: { type: String, enum: [...ICLOCK_ROSTER_OPS, ""], default: "" },
      commandIds: { type: [Number], default: [] },
      faceSha: { type: String, default: "" },
      at: { type: Date, default: null },
    },
    lastResult: {
      op: { type: String, default: "" },
      ok: { type: Boolean, default: null },
      code: { type: Number, default: null },
      at: { type: Date, default: null },
      faceSha: { type: String, default: "" },
      commandId: { type: Number, default: null },
      error: { type: String, default: "" },
      message: { type: String, default: "" },
    },
    machinePhoto: {
      kind: { type: String, default: "" },
      sha256: { type: String, default: "" },
      size: { type: Number, default: 0 },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true },
)

IclockDeviceUserSchema.index({ sn: 1, pin: 1 }, { unique: true })
IclockDeviceUserSchema.index({ sn: 1, "pending.op": 1 })
IclockDeviceUserSchema.index({ sn: 1, "lastResult.ok": 1, "lastResult.at": -1 })

export default mongoose.models.IclockDeviceUser || mongoose.model("IclockDeviceUser", IclockDeviceUserSchema)
