/**
 * Club Owner Service
 * ------------------
 * The single WRITE surface for the Club collection (gymkhana club accounts).
 * Every create/persist/delete goes through here so the model is mutated only
 * inside `src/services/club/` (reads live in clubQueries.service.js).
 *
 * Clubs are fetched hydrated by the caller, mutated in place, then persisted
 * via persistClub. No pre-save hooks; uniqueness is enforced by the model's
 * indexes on nameLower/emailLower/userId.
 */

import { Club } from "../../models/index.js"

export const clubOwner = {
  /** Create a club. Returns the created doc (may throw E11000 on dup). */
  async createClub(data) {
    return Club.create(data)
  },

  /** Persist a hydrated club doc mutated by the caller. Returns the doc. */
  async persistClub(club) {
    return club.save()
  },

  /** Delete a club by its linked user id (create-rollback cleanup). */
  async deleteClubByUserId(userId) {
    return Club.deleteOne({ userId })
  },
}

export default clubOwner
