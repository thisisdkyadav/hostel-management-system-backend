import mongoose from "mongoose"

const HostelGateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const HostelGate = mongoose.model("HostelGate", HostelGateSchema)

export default HostelGate
