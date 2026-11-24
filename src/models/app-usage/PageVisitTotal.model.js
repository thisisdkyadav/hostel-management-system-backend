/**
 * PageVisitTotal Model
 * All-time visit count per user per page, with first/last visit times. Kept
 * forever (PageVisit rows expire after 8 days).
 */

import mongoose from "mongoose"

const PageVisitTotalSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    page: { type: String, required: true },
    label: { type: String, default: "" },
    count: { type: Number, default: 0 },
    firstAt: { type: Date, required: true },
    lastAt: { type: Date, required: true },
  },
  { timestamps: false }
)

PageVisitTotalSchema.index({ userId: 1, page: 1 }, { unique: true })
PageVisitTotalSchema.index({ role: 1, lastAt: -1 })

const PageVisitTotal = mongoose.model("PageVisitTotal", PageVisitTotalSchema)

export default PageVisitTotal
