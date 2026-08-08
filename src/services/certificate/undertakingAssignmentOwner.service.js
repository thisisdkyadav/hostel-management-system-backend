/**
 * Undertaking Assignment Owner Service
 * ------------------------------------
 * The single WRITE surface for the UndertakingAssignment collection (which
 * students are assigned to which undertakings, and their acceptance state).
 * Every insert/persist/delete goes through here so the model is mutated only
 * inside `src/services/certificate/` (reads live in
 * undertakingAssignmentQueries.service.js).
 *
 * A unique {undertakingId, studentId} index enforces one assignment per
 * student per undertaking; bulk add uses { ordered: false } and the CALLER
 * catches E11000 to skip duplicates (behaviour preserved as-is).
 */

import { UndertakingAssignment } from "../../models/index.js"

export const undertakingAssignmentOwner = {
  /**
   * Bulk-insert assignments, unordered so duplicates don't abort the batch.
   * Returns the insertMany promise; the caller handles E11000 (dup skips).
   */
  async insertAssignments(assignments) {
    return UndertakingAssignment.insertMany(assignments, { ordered: false })
  },

  /** Persist a hydrated assignment doc mutated by the caller (view/accept). */
  async persistAssignment(assignment) {
    return assignment.save()
  },

  /** Delete every assignment for an undertaking (cascade on undertaking delete). */
  async deleteAssignmentsByUndertaking(undertakingId) {
    return UndertakingAssignment.deleteMany({ undertakingId })
  },

  /** Remove one student's assignment. Returns the deleted doc, or null. */
  async deleteAssignment(undertakingId, studentId) {
    return UndertakingAssignment.findOneAndDelete({ undertakingId, studentId })
  },
}

export default undertakingAssignmentOwner
