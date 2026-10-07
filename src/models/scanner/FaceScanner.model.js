/**
 * FaceScanner Model
 * Face scanner devices
 */

import mongoose from "mongoose"

const FaceScannerSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    passwordHash: { type: String, required: true }, // Header value (hashed)
    // Missing provider denotes an existing scanner using legacy auto-detection.
    provider: { type: String, enum: ["time-watch", "zkteco"] },
    deviceName: {
      type: String,
      trim: true,
      required: function () { return this.provider === "zkteco" },
    },
    name: { type: String, required: true },
    type: { type: String, enum: ["hostel-gate", "dining-meal"], required: true },
    direction: { type: String, enum: ["in", "out"], required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel" },
    catererId: { type: mongoose.Schema.Types.ObjectId, ref: "Caterer" },
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

FaceScannerSchema.index({ isActive: 1 })
FaceScannerSchema.index({ username: 1 })
FaceScannerSchema.index({ username: 1, provider: 1 }, {
  unique: true,
  partialFilterExpression: { provider: "time-watch" },
})
FaceScannerSchema.index({ deviceName: 1 }, {
  unique: true,
  partialFilterExpression: { provider: "zkteco" },
})
FaceScannerSchema.index({ type: 1, direction: 1, hostelId: 1, catererId: 1, createdAt: -1 })

// Exclude passwordHash from JSON output
FaceScannerSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.passwordHash
  return obj
}

FaceScannerSchema.pre("save", function () {
  this.updatedAt = Date.now()
})

const FaceScanner = mongoose.model("FaceScanner", FaceScannerSchema)
export default FaceScanner
