/**
 * Hostel Supervisor Model
 * Hostel supervisor user profile with hostel assignments
 */

import mongoose from "mongoose"

const hostelSupervisorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  hostelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hostel" }],
  activeHostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null },
  category: { type: String, default: "Hostel Supervisor" },
  status: {
    type: String,
    enum: ["assigned", "unassigned"],
    default: "unassigned",
  },
  joinDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const HostelSupervisor = mongoose.model("HostelSupervisor", hostelSupervisorSchema)
export default HostelSupervisor
