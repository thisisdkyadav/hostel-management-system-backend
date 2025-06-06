import mongoose from "mongoose"

const InsuranceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  insuranceProvider: { type: mongoose.Schema.Types.ObjectId, ref: "InsuranceProvider", required: true },
  insuranceNumber: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

InsuranceSchema.virtual("id").get(function () {
  return this._id
})

InsuranceSchema.set("toJSON", { virtuals: true })

const Insurance = mongoose.model("Insurance", InsuranceSchema)

export default Insurance
