/**
 * Undertaking Owner Service
 * -------------------------
 * The single WRITE surface for the Undertaking collection (documents students
 * must accept). Every create/update/delete goes through here so the model is
 * mutated only inside `src/services/certificate/` (reads live in
 * undertakingQueries.service.js). Assignment cascade-delete lives in
 * undertakingAssignmentOwner.
 *
 * Methods return raw model results (doc or null); the app service owns the
 * response envelope + error handling.
 */

import { Undertaking } from "../../models/index.js"

export const undertakingOwner = {
  /** Create an undertaking. Returns the created doc (throws on validation/dup). */
  async createUndertaking(data) {
    return Undertaking.create(data)
  },

  /**
   * Update an undertaking by id. Returns the updated doc, or null if not found.
   * Uses { new: true } only (NO runValidators) to match the existing call site.
   */
  async updateUndertaking(id, updates) {
    return Undertaking.findByIdAndUpdate(id, updates, { new: true })
  },

  /** Delete an undertaking by id. Returns the deleted doc, or null if not found. */
  async deleteUndertaking(id) {
    return Undertaking.findByIdAndDelete(id)
  },
}

export default undertakingOwner
