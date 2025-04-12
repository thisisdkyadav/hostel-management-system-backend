import mongoose from "mongoose"

const apiClientSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  apiKey: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
})

const ApiClient = mongoose.model("ApiClient", apiClientSchema)
export default ApiClient
