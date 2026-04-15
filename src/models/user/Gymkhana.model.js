/**
 * Gymkhana Model
 * Stores extended Gymkhana profile metadata
 */

import mongoose from "mongoose"

const GymkhanaSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  categories: [{ type: String }],
  position: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

GymkhanaSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

GymkhanaSchema.index({ categories: 1 })

const Gymkhana = mongoose.model("Gymkhana", GymkhanaSchema)
export default Gymkhana
