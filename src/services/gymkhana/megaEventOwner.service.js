/**
 * Mega Event Owner Service
 * ------------------------
 * The single WRITE surface for the MegaEventSeries and MegaEventOccurrence
 * collections (recurring flagship events + their embedded proposal/expense
 * approval flows). Every create/persist goes through here so these models are
 * mutated only inside `src/services/gymkhana/` (reads live in
 * megaEventQueries.service.js).
 *
 * Occurrences are mutated in place by the app service (embedded proposal/
 * expense subdocs) and then persisted via persistOccurrence, which runs the
 * MegaEventOccurrence pre-save hook (proposalDueDate + expense totals).
 */

import { MegaEventSeries, MegaEventOccurrence } from "../../models/index.js"

export const megaEventOwner = {
  /** Create a mega-event series. Returns the created doc. */
  async createSeries(data) {
    return MegaEventSeries.create(data)
  },

  /** Create a mega-event occurrence. Returns the created doc (pre-save hook runs). */
  async createOccurrence(data) {
    return MegaEventOccurrence.create(data)
  },

  /**
   * Persist a hydrated occurrence doc mutated by the caller. Runs the pre-save
   * hook (proposalDueDate + expense.totalExpenditure/budgetVariance). Returns
   * the saved doc.
   */
  async persistOccurrence(occurrence) {
    return occurrence.save()
  },
}

export default megaEventOwner
