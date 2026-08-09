/**
 * Health Owner Service
 * --------------------
 * The single WRITE surface for the `Health` collection (per-user health info:
 * blood group + insurance sub-doc). Per the domain-ownership rule, the model is
 * mutated ONLY inside `src/services/health/`; the health app-service, the
 * insurance-provider bulk flow, and the student-profile service route every
 * write through here (reads live in healthQueries.service.js).
 *
 * No pre-save hook (createdAt/updatedAt are schema defaults; bulk updates set
 * updatedAt explicitly). userId is UNIQUE. The insert/bulkWrite methods accept
 * a transaction { session } because both bulk callers run inside withTransaction.
 */

import { Health } from "../../models/index.js"

export const healthOwner = {
  /** Create a health record (getHealth create-if-missing). */
  async createHealth(data) {
    return Health.create(data)
  },

  /** Upsert-style update of a user's health record ({ new: true }). Returns doc or null. */
  async updateHealthByUser(userId, updates) {
    return Health.findOneAndUpdate({ userId }, updates, { new: true })
  },

  /** Set just the blood group for a user. Returns the raw updateOne result. */
  async setBloodGroupByUser(userId, bloodGroup) {
    return Health.updateOne({ userId }, { $set: { bloodGroup } })
  },

  /** Bulk-insert health records (transaction-aware). */
  async insertHealthRecords(records, { session } = {}) {
    return Health.insertMany(records, { session })
  },

  /** Bulk-write health ops (transaction-aware). */
  async bulkWriteHealth(ops, { session } = {}) {
    return Health.bulkWrite(ops, { session })
  },
}

export default healthOwner
