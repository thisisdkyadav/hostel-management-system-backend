import mongoose from "mongoose"

/**
 * HMS's copy of one face-scanner user (an EasyWDMS employee; emp_code = roll
 * number). Kept deliberately small: who they are, whether they have a usable
 * bio photo, and what each machine said about it. The photo itself stays in
 * EasyWDMS (HMS proxies it for display).
 *
 * Refreshed by the nightly sync and after every HMS push. photoStatus:
 *   valid   — EasyWDMS has an approved bio photo and no machine rejected it
 *   pending — approval pending, or a machine hasn't answered the latest push
 *   failed  — rejected, or a machine reported an error for the latest push
 *   missing — no bio photo
 */
export const SCANNER_PHOTO_STATUSES = ["valid", "pending", "failed", "missing"]
export const PROFILE_ATTEMPT_OUTCOMES = ["sent", "unusable", "failed"]

const DeviceResultSchema = new mongoose.Schema(
  {
    sn: { type: String, default: "" },
    alias: { type: String, default: "" },
    // true = accepted, false = error, null = sent but not answered yet
    ok: { type: Boolean, default: null },
    message: { type: String, default: "" },
    commandId: { type: Number, default: 0 },
    at: { type: String, default: "" }, // EasyWDMS time, as EasyWDMS reports it
  },
  { _id: false }
)

const BioPhotoSchema = new mongoose.Schema(
  {
    present: { type: Boolean, default: false },
    approval: { type: String, default: "" },
    path: { type: String, default: "" }, // e.g. biophoto/<company>/<roll>.jpg
    registeredAt: { type: String, default: "" }, // EasyWDMS time
  },
  { _id: false }
)

const ProfileAttemptSchema = new mongoose.Schema(
  {
    at: { type: Date, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    outcome: { type: String, enum: [...PROFILE_ATTEMPT_OUTCOMES, ""], default: "" },
    message: { type: String, default: "" },
  },
  { _id: false }
)

const DiningScannerUserSchema = new mongoose.Schema(
  {
    rollNumber: { type: String, required: true, trim: true },
    name: { type: String, default: "" },
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    onScanner: { type: Boolean, default: true },
    bioPhoto: { type: BioPhotoSchema, default: () => ({}) },
    devices: { type: [DeviceResultSchema], default: [] },
    devicesChecked: { type: Boolean, default: false },
    photoStatus: { type: String, enum: SCANNER_PHOTO_STATUSES, default: "missing" },
    profileAttempt: { type: ProfileAttemptSchema, default: () => ({}) },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    addedAt: { type: Date, default: null },
    syncedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

DiningScannerUserSchema.index({ rollNumber: 1 }, { unique: true })
DiningScannerUserSchema.index({ onScanner: 1, photoStatus: 1, rollNumber: 1 })
DiningScannerUserSchema.index({ studentUserId: 1 })

export const DiningScannerUser = mongoose.models.DiningScannerUser || mongoose.model("DiningScannerUser", DiningScannerUserSchema)
export default DiningScannerUser
