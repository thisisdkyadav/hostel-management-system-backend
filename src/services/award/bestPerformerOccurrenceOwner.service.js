/**
 * Overall Best Performer Occurrence Owner Service
 * -----------------------------------------------
 * The single WRITE surface for the OverallBestPerformerOccurrence collection
 * (an award cycle: apply window + eligibility). Every create/persist/close goes
 * through here so the model is mutated only inside `src/services/award/` (reads
 * live in bestPerformerOccurrenceQueries.service.js).
 *
 * Only one occurrence is "active" at a time; the close* helpers enforce that by
 * flipping others to closed. Status literals mirror the model enum
 * (["active","closed"]).
 */

import { OverallBestPerformerOccurrence } from "../../models/index.js"

export const bestPerformerOccurrenceOwner = {
  /** Create an occurrence. Returns the created doc. */
  async createOccurrence(data) {
    return OverallBestPerformerOccurrence.create(data)
  },

  /** Persist a hydrated occurrence doc mutated by the caller. Returns the doc. */
  async persistOccurrence(occurrence) {
    return occurrence.save()
  },

  /** Expiry sweep: close every active occurrence whose apply window has ended. */
  async closeExpiredOccurrences(currentTime) {
    return OverallBestPerformerOccurrence.updateMany(
      { status: "active", applyEndAt: { $lt: currentTime } },
      { $set: { status: "closed", closedAt: currentTime } }
    )
  },

  /** Close ALL active occurrences (before activating a new one). */
  async closeAllActiveOccurrences({ closedAt, updatedBy }) {
    return OverallBestPerformerOccurrence.updateMany(
      { status: "active" },
      { $set: { status: "closed", closedAt, updatedBy } }
    )
  },

  /** Close every OTHER active occurrence (when re-activating this one). */
  async closeOtherActiveOccurrences(excludeId, { closedAt }) {
    return OverallBestPerformerOccurrence.updateMany(
      { _id: { $ne: excludeId }, status: "active" },
      { $set: { status: "closed", closedAt } }
    )
  },
}

export default bestPerformerOccurrenceOwner
