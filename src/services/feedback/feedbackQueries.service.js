/**
 * Feedback Queries Service
 * ------------------------
 * The single READ surface for the `Feedback` collection. The feedback
 * app-service reads through these instead of importing the model, so it is
 * touched only inside `src/services/feedback/` (writes live in
 * feedbackOwner.service.js).
 *
 * Populate uses the shared PRESETS.FEEDBACK spec, exactly as the original
 * caller did. Both list reads sort { createdAt: -1 } (findByUserPopulated
 * mirrors the old BaseService.findAll default sort).
 */

import { Feedback } from "../../models/index.js"
import { PRESETS } from "../base/index.js"

export const feedbackQueries = {
  /** Paginated feedback list (admin/scoped view), newest first, populated. */
  async listFeedbacks(filter, { skip, limit }) {
    return Feedback.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate(PRESETS.FEEDBACK)
  },

  /** Count feedbacks matching a filter (totals / status breakdown). */
  async countFeedbacks(filter) {
    return Feedback.countDocuments(filter)
  },

  /** createdAt of the newest feedback matching a filter (lean, createdAt only). */
  async findLatestCreatedAt(filter) {
    return Feedback.findOne(filter).sort({ createdAt: -1 }).select("createdAt").lean()
  },

  /** All of a user's feedbacks, newest first, populated (student self-view). */
  async findByUserPopulated(userId) {
    return Feedback.find({ userId }).sort({ createdAt: -1 }).populate(PRESETS.FEEDBACK)
  },
}

export default feedbackQueries
