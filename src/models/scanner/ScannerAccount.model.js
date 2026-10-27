import mongoose from "mongoose"

const ScannerAccountSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  provider: { type: String, enum: ["zkteco"], default: "zkteco", required: true },
  username: { type: String, required: true, trim: true },
  passwordHash: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  lastActiveAt: Date,
}, { timestamps: true })

ScannerAccountSchema.index({ username: 1 }, { unique: true, collation: { locale: "en", strength: 2 } })
ScannerAccountSchema.methods.toJSON = function () {
  const obj = this.toObject()
  delete obj.passwordHash
  return obj
}

export default mongoose.model("ScannerAccount", ScannerAccountSchema)
