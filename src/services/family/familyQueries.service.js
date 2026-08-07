/**
 * Family Queries Service
 * ----------------------
 * The single READ surface for the FamilyMember collection. Callers
 * (administration/family, students/student-profile) use these instead of
 * importing the model, so FamilyMember is touched only inside
 * `src/services/family/` (writes live in familyOwner.service.js).
 */

import { FamilyMember } from "../../models/index.js"

export const familyQueries = {
  /** All family members for a user (hydrated docs). */
  async findByUserId(userId) {
    return FamilyMember.find({ userId })
  },

  /** A single family member by id (hydrated). */
  async findById(memberId) {
    return FamilyMember.findById(memberId)
  },
}

export default familyQueries
