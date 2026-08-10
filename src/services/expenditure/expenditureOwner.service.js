/**
 * Expenditure Owner Service
 * -------------------------
 * The single owner of all WRITES to the Student-Affairs expenditure collection
 * (ExpenditureOccurrence). Everything — expenses, bills, payments, documents —
 * is embedded on the occurrence, so entry-level changes are done by the app
 * service mutating the hydrated occurrence and persisting through here. Nothing
 * else writes this collection.
 */

import { ExpenditureOccurrence } from "../../models/index.js"

export const expenditureOwner = {
  /** Create an expenditure occurrence. */
  async createOccurrence(data) {
    return ExpenditureOccurrence.create(data)
  },

  /** Persist a mutated hydrated occurrence (any occurrence/expense/bill/payment/document change). */
  async persistOccurrence(occurrence) {
    await occurrence.save()
    return occurrence
  },

  /** Delete an occurrence (and, being embedded, all its entries). Returns the deleted doc or null. */
  async deleteOccurrenceById(id) {
    return ExpenditureOccurrence.findByIdAndDelete(id)
  },
}

export default expenditureOwner
