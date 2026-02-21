/**
 * Insurance Claim Model
 * Stores insurance claims made by users
 */

import mongoose from "mongoose"

const InsuranceClaimSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  insuranceProvider: { type: mongoose.Schema.Types.ObjectId, ref: "InsuranceProvider", required: true },
  amount: { type: Number },
  hospitalName: { type: String },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

InsuranceClaimSchema.index({ userId: 1 })

InsuranceClaimSchema.virtual("id").get(function () {
  return this._id
})

InsuranceClaimSchema.set("toJSON", { virtuals: true })

const InsuranceClaim = mongoose.model("InsuranceClaim", InsuranceClaimSchema)

export default InsuranceClaim
