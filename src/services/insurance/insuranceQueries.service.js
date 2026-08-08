/**
 * Insurance Queries Service
 * -------------------------
 * The single READ surface for the Insurance domain — the `InsuranceProvider`
 * and `InsuranceClaim` collections. The provider and health app-services read
 * through these instead of importing the models, so the collections are touched
 * only inside `src/services/insurance/` (writes live in
 * insuranceOwner.service.js).
 *
 * Read shapes mirror each original caller EXACTLY:
 *  - listProviders sorts { createdAt: -1 } (the old BaseService.findAll default).
 *  - findProviderById is a bare findById used by the bulk-update existence
 *    check; the original ran it WITHOUT the transaction session, so this method
 *    intentionally takes no session either.
 *  - findClaimsByUser is a bare find({ userId }) — no sort/populate, as before.
 */

import { InsuranceProvider, InsuranceClaim } from "../../models/index.js"

export const insuranceQueries = {
  // ==================== InsuranceProvider ====================

  /** All providers, newest first (matches the old BaseService.findAll default). */
  async listProviders() {
    return InsuranceProvider.find().sort({ createdAt: -1 })
  },

  /**
   * One provider by id — existence check for bulk student-insurance updates.
   * Deliberately session-less (the original read was not part of the txn).
   */
  async findProviderById(id) {
    return InsuranceProvider.findById(id)
  },

  // ==================== InsuranceClaim ====================

  /** A user's insurance claims (bare find, no sort/populate — as before). */
  async findClaimsByUser(userId) {
    return InsuranceClaim.find({ userId })
  },
}

export default insuranceQueries
