/**
 * Overall Best Performer Occurrence Queries Service
 * -------------------------------------------------
 * The single READ surface for the OverallBestPerformerOccurrence collection.
 * The best-performer app-service reads through these instead of importing the
 * model, so it is touched only inside `src/services/award/` (writes live in
 * bestPerformerOccurrenceOwner.service.js).
 *
 * sort/lean choices mirror each original caller EXACTLY. Bare findById/findOne
 * return hydrated docs (mutate-then-persist).
 */

import { OverallBestPerformerOccurrence } from "../../models/index.js"

export const bestPerformerOccurrenceQueries = {
  /** Occurrence by id (hydrated — mutate-then-persist and detail reads). */
  async findOccurrenceById(id) {
    return OverallBestPerformerOccurrence.findById(id)
  },

  /** The current active occurrence, latest apply window first (hydrated). */
  async findActiveOccurrence() {
    return OverallBestPerformerOccurrence.findOne({ status: "active" }).sort({
      applyEndAt: -1,
      createdAt: -1,
    })
  },

  /** All occurrences for the selector, newest award year first, lean. */
  async listOccurrences() {
    return OverallBestPerformerOccurrence.find({})
      .sort({ awardYear: -1, applyEndAt: -1, createdAt: -1 })
      .lean()
  },
}

export default bestPerformerOccurrenceQueries
