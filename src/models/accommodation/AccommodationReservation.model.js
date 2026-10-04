import mongoose from "mongoose"
// Dated H4 occupancy. Never replaces resident allocations or changes Room.status.
const schema = new mongoose.Schema(
  {
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: "AccommodationRequest", required: true, unique: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    active: { type: Boolean, default: true },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: "" },
  },
  { timestamps: true },
)
schema.index({ roomId: 1, active: 1, from: 1, to: 1 })
schema.index({ hostelId: 1, active: 1, from: 1, to: 1 })
export default mongoose.model("AccommodationReservation", schema)
