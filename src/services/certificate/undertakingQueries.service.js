/**
 * Undertaking Queries Service
 * ---------------------------
 * The single READ surface for the Undertaking collection. The undertakings
 * app-service reads through these instead of importing the model, so Undertaking
 * is touched only inside `src/services/certificate/` (writes live in
 * undertakingOwner.service.js).
 *
 * populate/sort choices mirror each original caller EXACTLY. Bare findById
 * returns a hydrated doc.
 */

import { Undertaking } from "../../models/index.js"

export const undertakingQueries = {
  /**
   * All undertakings for the admin list, newest first, with creator populated
   * and the totalStudents / acceptedCount virtuals (counts of assignments)
   * populated. Returns hydrated docs (caller reads the virtuals).
   */
  async listUndertakingsWithCounts() {
    return Undertaking.find()
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .populate("totalStudents")
      .populate("acceptedCount")
  },

  /** Undertaking by id (hydrated — existence checks and detail reads). */
  async findUndertakingById(id) {
    return Undertaking.findById(id)
  },
}

export default undertakingQueries
