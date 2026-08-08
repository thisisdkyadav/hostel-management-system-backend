/**
 * Club Queries Service
 * --------------------
 * The single READ surface for the Club collection. The clubs and POR
 * app-services read through these instead of importing the model, so Club is
 * touched only inside `src/services/club/` (writes live in
 * clubOwner.service.js).
 *
 * NOTE: nameLower/emailLower are `select: false` on the schema; the methods
 * that need them add `+nameLower +emailLower` exactly as the callers did.
 * populate/lean choices mirror each original caller EXACTLY.
 */

import { Club } from "../../models/index.js"

export const clubQueries = {
  /** All clubs, alphabetical, lean (admin club list). */
  async listClubs() {
    return Club.find().sort({ name: 1 }).lean()
  },

  /** Duplicate-guard lookup by nameLower OR emailLower (hydrated, +lowers). */
  async findClubByNameOrEmailLower(nameLower, emailLower) {
    return Club.findOne({ $or: [{ nameLower }, { emailLower }] }).select("+nameLower +emailLower")
  },

  /** Club by id with the select:false lower fields (for edit + dup checks). */
  async findClubByIdWithLowers(id) {
    return Club.findById(id).select("+nameLower +emailLower")
  },

  /** Another club (excluding this id) sharing a nameLower (rename conflict). */
  async findOtherClubByNameLower(excludeId, nameLower) {
    return Club.findOne({ _id: { $ne: excludeId }, nameLower })
  },

  /** Another club (excluding this id) sharing an emailLower (email conflict). */
  async findOtherClubByEmailLower(excludeId, emailLower) {
    return Club.findOne({ _id: { $ne: excludeId }, emailLower })
  },

  /** A user's own club, lean (club self view). */
  async findClubByUserIdLean(userId) {
    return Club.findOne({ userId }).lean()
  },

  /** A user's club with a compact projection, lean (POR viewer context). */
  async findClubByUserIdSelect(userId) {
    return Club.findOne({ userId }).select("_id userId gymkhanaCategoryKey name").lean()
  },

  /** All clubs with the fields the POR legacy-category sync needs, lean. */
  async listClubsForSync() {
    return Club.find().select("_id name userId gymkhanaCategoryKey email").lean()
  },
}

export default clubQueries
