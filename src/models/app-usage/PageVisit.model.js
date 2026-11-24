/**
 * PageVisit Model
 * One row per page opened by any logged-in user, kept for 8 days (TTL) so the
 * admin App Usage page can show each user's last 7 days visit by visit. Older
 * activity survives only as per-page totals (PageVisitTotal).
 */

import mongoose from "mongoose"

export const PAGE_VISIT_KEEP_DAYS = 8

const PageVisitSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true },
    page: { type: String, required: true }, // route pattern, e.g. /admin/attendance/:occurrenceId
    label: { type: String, default: "" }, // catalog name, e.g. "Attendance"
    path: { type: String, required: true }, // the actual path opened
    platform: { type: String, enum: ["android", "ios", "desktop"], default: "desktop" },
    mode: { type: String, enum: ["app", "browser"], default: "browser" },
    at: { type: Date, required: true },
  },
  { timestamps: false }
)

PageVisitSchema.index({ userId: 1, at: -1 })
PageVisitSchema.index({ role: 1, at: -1 })
PageVisitSchema.index({ at: 1 }, { expireAfterSeconds: PAGE_VISIT_KEEP_DAYS * 24 * 60 * 60 })

const PageVisit = mongoose.model("PageVisit", PageVisitSchema)

export default PageVisit
