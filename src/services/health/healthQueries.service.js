/**
 * Health Queries Service
 * ----------------------
 * The single READ surface for the `Health` collection. Every reader (the health
 * app-service, student-profile, profiles-self, and the insurance-provider bulk
 * flow) reads through these instead of importing the model, so it is touched
 * only inside `src/services/health/` (writes live in healthOwner.service.js).
 *
 * findByUserWithProvider populates the cross-domain `insurance.insuranceProvider`
 * ref — resolved via mongoose's model registry (no InsuranceProvider import), so
 * it stays in-boundary. findByUsers accepts a transaction { session }.
 */

import { Health } from "../../models/index.js"

export const healthQueries = {
  /** One user's health record (bare, no populate). */
  async findByUser(userId) {
    return Health.findOne({ userId })
  },

  /** One user's health record with the insurance provider populated. */
  async findByUserWithProvider(userId) {
    return Health.findOne({ userId }).populate("insurance.insuranceProvider")
  },

  /** Health records for many users (transaction-aware; bulk flows). */
  async findByUsers(userIds, { session } = {}) {
    const query = Health.find({ userId: { $in: userIds } })
    if (session) query.session(session)
    return query
  },
}

export default healthQueries
