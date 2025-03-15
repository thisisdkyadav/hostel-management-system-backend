import mongoose from "mongoose"

const HostelSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { type: String, enum: ["unit-based", "room-only"], required: true },
  location: { type: String, required: true },
  gender: { type: String, enum: ["Male", "Female", "Co-ed"], required: true },
  totalCapacity: { type: Number, required: true },
  currentOccupancy: { type: Number, default: 0 },
  wardenId: { type: mongoose.Schema.Types.ObjectId, ref: "Warden" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

HostelSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Hostel = mongoose.model("Hostel", HostelSchema)
export default Hostel
