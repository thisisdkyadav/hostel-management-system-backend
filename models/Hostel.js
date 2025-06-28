import mongoose from "mongoose"

const HostelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ["unit-based", "room-only"], required: true },
    gender: { type: String, enum: ["Boys", "Girls", "Co-ed"], required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isArchived: { type: Boolean, default: false },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

HostelSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Hostel = mongoose.model("Hostel", HostelSchema)
export default Hostel
