import mongoose from "mongoose"
const schema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 120, required: true },
    creatorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    facultyUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
)
schema.index({ creatorUserId: 1, createdAt: -1 })
export default mongoose.model("AccommodationBatch", schema)
