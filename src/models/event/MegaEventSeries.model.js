/**
 * Mega Event Series Model
 * Groups recurring flagship events and tracks occurrence history.
 */

import mongoose from "mongoose"

const MegaEventSeriesSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    description: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

MegaEventSeriesSchema.index({ isActive: 1 })

const MegaEventSeries = mongoose.model("MegaEventSeries", MegaEventSeriesSchema)

export default MegaEventSeries
