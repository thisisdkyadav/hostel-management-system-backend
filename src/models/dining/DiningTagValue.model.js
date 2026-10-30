import mongoose from "mongoose"

/** One student's explicit yes/no for a DiningTag (absent = not answered). */
const DiningTagValueSchema = new mongoose.Schema(
  {
    tagId: { type: mongoose.Schema.Types.ObjectId, ref: "DiningTag", required: true },
    studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", default: null },
    rollNumber: { type: String, trim: true, uppercase: true, default: "" },
    value: { type: Boolean, required: true },
    source: { type: String, enum: ["student", "admin", "csv"], required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

DiningTagValueSchema.index({ tagId: 1, studentUserId: 1 }, { unique: true })
DiningTagValueSchema.index({ studentUserId: 1 })
DiningTagValueSchema.index({ tagId: 1, value: 1 })

const DiningTagValue = mongoose.model("DiningTagValue", DiningTagValueSchema)

export default DiningTagValue
