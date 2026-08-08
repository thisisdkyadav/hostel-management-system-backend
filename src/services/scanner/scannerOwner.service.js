/**
 * Scanner Owner Service
 * ---------------------
 * The single WRITE surface for the entire Scanner domain — both the `ApiClient`
 * (external API clients) and `FaceScanner` (face-scanner devices) collections.
 * Per the domain-ownership rule, these two models are mutated ONLY inside
 * `src/services/scanner/`; the super-admin service (ApiClient), the
 * face-scanner service, and the scanner-auth middleware (FaceScanner) route
 * every write through here (reads live in scannerQueries.service.js).
 *
 * Hook / option semantics preserved EXACTLY:
 *  - FaceScanner has a `pre("save")` hook (sets updatedAt). createScanner and
 *    persistScanner go through the save path so the hook FIRES; updateScannerById
 *    and touchScannerLastActive use findByIdAndUpdate, which does NOT fire it —
 *    matching each original caller.
 *  - updateScannerById / updateApiClientById use { new: true } ONLY (no
 *    runValidators — neither original passed it).
 *  - touchScannerLastActive returns the query WITHOUT awaiting so the middleware
 *    can keep its fire-and-forget `.catch()` (must never block a scan).
 */

import { ApiClient, FaceScanner } from "../../models/index.js"

// Populate chain shared by the FaceScanner reads/writes that return a device
// with its linked hostel + caterer (name/type, name/email).
const withScannerRefs = (query) =>
  query.populate("hostelId", "name type").populate("catererId", "name email")

export const scannerOwner = {
  // ==================== ApiClient ====================

  /** Create an API client. Throws on error (caller maps 11000 → 409). */
  async createApiClient(data) {
    return ApiClient.create(data)
  },

  /** Update an API client by id ({ new: true } only). Returns doc or null. */
  async updateApiClientById(id, updates) {
    return ApiClient.findByIdAndUpdate(id, updates, { new: true })
  },

  /** Delete an API client by id. Returns the deleted doc or null. */
  async deleteApiClientById(id) {
    return ApiClient.findByIdAndDelete(id)
  },

  // ==================== FaceScanner ====================

  /** Create a face-scanner device (save path — pre-save hook fires). */
  async createScanner(data) {
    return FaceScanner.create(data)
  },

  /** Persist a hydrated FaceScanner doc (save path — hook fires: regen password). */
  async persistScanner(scannerDoc) {
    return scannerDoc.save()
  },

  /**
   * Update a scanner by id, returning the updated device with hostel/caterer
   * populated. { new: true } only; findByIdAndUpdate does NOT fire the pre-save
   * hook (matches the original). Returns doc or null.
   */
  async updateScannerById(id, updates) {
    return withScannerRefs(FaceScanner.findByIdAndUpdate(id, updates, { new: true }))
  },

  /** Delete a scanner by id. Returns the deleted doc or null. */
  async deleteScannerById(id) {
    return FaceScanner.findByIdAndDelete(id)
  },

  /**
   * Bump a scanner's lastActiveAt. Returns the query UN-awaited so the auth
   * middleware keeps its non-blocking fire-and-forget `.catch()`.
   */
  touchScannerLastActive(id) {
    return FaceScanner.findByIdAndUpdate(id, { lastActiveAt: new Date() })
  },
}

export default scannerOwner
