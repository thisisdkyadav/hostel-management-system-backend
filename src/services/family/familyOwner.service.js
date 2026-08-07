/**
 * Family Owner Service
 * --------------------
 * The single owner of all WRITES to the FamilyMember collection. Callers
 * (administration/family bulk + CRUD, students/student-profile self CRUD) go
 * through these instead of touching the model. FamilyMember has no hooks, so
 * these are thin, but centralising them completes the ownership boundary and
 * gives one home for the collection's writes.
 */

import { FamilyMember } from "../../models/index.js"

export const familyOwner = {
  /** Create one family member; returns the created doc. */
  async create(data) {
    return FamilyMember.create(data)
  },

  /** Update by id (validated); returns the updated doc or null if not found. */
  async updateById(memberId, updates) {
    return FamilyMember.findByIdAndUpdate(memberId, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete by id; returns the deleted doc or null if not found. */
  async deleteById(memberId) {
    return FamilyMember.findByIdAndDelete(memberId)
  },

  /** Bulk delete all members for a set of users (txn session). */
  async deleteManyByUserIds(userIds, { session } = {}) {
    return FamilyMember.deleteMany({ userId: { $in: userIds } }, session ? { session } : {})
  },

  /** Bulk insert members (txn session). */
  async insertMany(docs, { session } = {}) {
    return FamilyMember.insertMany(docs, session ? { session } : {})
  },
}

export default familyOwner
