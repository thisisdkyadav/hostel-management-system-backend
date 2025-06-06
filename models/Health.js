import mongoose from "mongoose"

const HealthSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bloodGroup: { type: String },
  insurances: [{ type: mongoose.Schema.Types.ObjectId, ref: "Insurance" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

HealthSchema.virtual("id").get(function () {
  return this._id
})

HealthSchema.set("toJSON", { virtuals: true })

const Health = mongoose.model("Health", HealthSchema)

export default Health
