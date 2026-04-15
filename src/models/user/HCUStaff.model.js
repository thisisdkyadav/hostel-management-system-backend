/**
 * HCU Staff Model
 * Dedicated profile metadata for Admin users with HCU sub-role
 */

import mongoose from "mongoose"

const HCUStaffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  category: { type: String, default: "HCU" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

HCUStaffSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

export default mongoose.model("HCUStaff", HCUStaffSchema)
