/**
 * Configuration Model
 * Stores system configuration key-value pairs
 */

import mongoose from "mongoose"

const configurationSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
})

// Pre-save hook to update lastUpdated timestamp
configurationSchema.pre("save", function (next) {
  this.lastUpdated = Date.now()
  next()
})

const Configuration = mongoose.model("Configuration", configurationSchema)

export default Configuration
