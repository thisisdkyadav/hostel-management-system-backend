/**
 * Health Model
 * Stores health information for users
 */

import mongoose from "mongoose"

const HealthSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  bloodGroup: { type: String },
  insurance: {
    insuranceProvider: { type: mongoose.Schema.Types.ObjectId, ref: "InsuranceProvider" },
    insuranceNumber: { type: String },
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

HealthSchema.virtual("id").get(function () {
  return this._id
})

// code to always send the insurance provider name, start date, end date in the response

HealthSchema.set("toJSON", { virtuals: true })

const Health = mongoose.model("Health", HealthSchema)

export default Health
