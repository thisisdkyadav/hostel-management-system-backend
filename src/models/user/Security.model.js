/**
 * Security Model
 * Security staff user profile
 */

import mongoose from "mongoose"

const SecuritySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

SecuritySchema.index({ userId: 1 })
SecuritySchema.index({ hostelId: 1 })

const Security = mongoose.model("Security", SecuritySchema)
export default Security
