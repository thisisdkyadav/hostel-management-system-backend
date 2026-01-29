/**
 * FaceScanner Model
 * Face scanner devices
 */

import mongoose from "mongoose"

const FaceScannerSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true }, // Header key name
    passwordHash: { type: String, required: true }, // Header value (hashed)
    name: { type: String, required: true },
    type: { type: String, enum: ["hostel-gate"], required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel" },
    isActive: { type: Boolean, default: true },
    lastActiveAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Exclude passwordHash from JSON output
FaceScannerSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.passwordHash
  return obj
}

FaceScannerSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const FaceScanner = mongoose.model("FaceScanner", FaceScannerSchema)
export default FaceScanner
