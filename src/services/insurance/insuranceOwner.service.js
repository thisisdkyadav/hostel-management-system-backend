/**
 * Insurance Owner Service
 * -----------------------
 * The single WRITE surface for the entire Insurance domain — both the
 * `InsuranceProvider` (providers/policies) and `InsuranceClaim` (per-user
 * claims, which ref a provider) collections. Per the domain-ownership rule,
 * these two models are mutated ONLY inside `src/services/insurance/`; the
 * provider app-service (insuranceProvider.service.js) and the health
 * app-service (health.service.js, which owns claims) route every write through
 * here (reads live in insuranceQueries.service.js).
 *
 * Combined into one owner because the two collections form a single domain
 * (a claim points at a provider). Methods are model-qualified (Provider vs
 * Claim) to keep intent explicit.
 *
 * Write-option semantics preserved EXACTLY from the two original callers:
 *  - updateProviderById → { new: true, runValidators: true } (matched the old
 *    BaseService.updateById the provider service inherited).
 *  - updateClaimById → { new: true } ONLY (the old health service passed just
 *    { new: true }, no runValidators) — do NOT add runValidators here.
 */

import { InsuranceProvider, InsuranceClaim } from "../../models/index.js"

export const insuranceOwner = {
  // ==================== InsuranceProvider ====================

  /** Create an insurance provider. Throws on error (caller maps envelope). */
  async createProvider(data) {
    return InsuranceProvider.create(data)
  },

  /**
   * Update a provider by id. { new: true, runValidators: true } mirrors the
   * old BaseService.updateById. Returns the updated doc or null (not found).
   */
  async updateProviderById(id, updates) {
    return InsuranceProvider.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete a provider by id. Returns the deleted doc or null. */
  async deleteProviderById(id) {
    return InsuranceProvider.findByIdAndDelete(id)
  },

  // ==================== InsuranceClaim ====================

  /** Create an insurance claim. */
  async createClaim(data) {
    return InsuranceClaim.create(data)
  },

  /**
   * Update a claim by id. { new: true } ONLY — the original health service did
   * NOT pass runValidators; keep it that way. Returns the updated doc or null.
   */
  async updateClaimById(id, updates) {
    return InsuranceClaim.findByIdAndUpdate(id, updates, { new: true })
  },

  /** Delete a claim by id. Returns the deleted doc or null. */
  async deleteClaimById(id) {
    return InsuranceClaim.findByIdAndDelete(id)
  },
}

export default insuranceOwner
