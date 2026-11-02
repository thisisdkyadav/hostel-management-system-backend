import mongoose from "mongoose"

/**
 * A student's request to change the photo the face scanners (ZKTeco, managed
 * through EasyWDMS) use to recognise them. Admin or the Dining Office approves
 * it; approving uploads the photo to EasyWDMS, which pushes it to every machine.
 *
 * A failed upload leaves the request pending with push.lastError so the
 * reviewer can retry or reject. push.lockedAt is a short claim that stops two
 * reviewers pushing the same request at once.
 */
export const BIO_PHOTO_STATUSES = ["pending", "approved", "rejected", "cancelled"]

const PhotoSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true },
    name: { type: String, default: "" },
    contentType: { type: String, enum: ["image/jpeg", "image/png"], required: true },
    size: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { _id: false }
)

const PushSchema = new mongoose.Schema(
  {
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    lastError: { type: String, default: "" },
    pushedAt: { type: Date, default: null },
    lockedAt: { type: Date, default: null },
  },
  { _id: false }
)

const DiningBioPhotoRequestSchema = new mongoose.Schema(
  {
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    rollNumber: { type: String, required: true, trim: true },
    photo: { type: PhotoSchema, required: true },
    note: { type: String, default: "", maxlength: 300 },
    status: { type: String, enum: BIO_PHOTO_STATUSES, default: "pending", required: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewComment: { type: String, default: "", maxlength: 300 },
    push: { type: PushSchema, default: () => ({}) },
  },
  { timestamps: true }
)

// One open request per student.
DiningBioPhotoRequestSchema.index(
  { studentUserId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_per_student" }
)
DiningBioPhotoRequestSchema.index({ studentUserId: 1, createdAt: -1 })
DiningBioPhotoRequestSchema.index({ status: 1, createdAt: -1 })

const DiningBioPhotoRequest = mongoose.model("DiningBioPhotoRequest", DiningBioPhotoRequestSchema)

export default DiningBioPhotoRequest
