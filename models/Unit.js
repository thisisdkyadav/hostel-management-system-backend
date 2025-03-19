import mongoose from "mongoose"

const UnitSchema = new mongoose.Schema({
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
  unitNumber: { type: String, required: true },
  floor: { type: Number },
  commonAreaDetails: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

UnitSchema.index({ hostelId: 1, unitNumber: 1 }, { unique: true })

UnitSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Unit = mongoose.model("Unit", UnitSchema)
export default Unit
