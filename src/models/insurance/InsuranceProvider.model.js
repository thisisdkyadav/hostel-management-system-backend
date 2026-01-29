/**
 * Insurance Provider Model
 * Stores insurance provider information
 */

import mongoose from "mongoose"

const InsuranceProviderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

InsuranceProviderSchema.virtual("id").get(function () {
  return this._id
})

InsuranceProviderSchema.set("toJSON", { virtuals: true })

const InsuranceProvider = mongoose.model("InsuranceProvider", InsuranceProviderSchema)

export default InsuranceProvider
