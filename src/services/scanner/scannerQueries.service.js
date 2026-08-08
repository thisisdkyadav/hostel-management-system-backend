/**
 * Scanner Queries Service
 * -----------------------
 * The single READ surface for the Scanner domain — the `ApiClient` and
 * `FaceScanner` collections. The super-admin service, the face-scanner service,
 * and the scanner-auth middleware read through these instead of importing the
 * models, so the collections are touched only inside `src/services/scanner/`
 * (writes live in scannerOwner.service.js).
 *
 * lean / hydrated / populate choices mirror each original caller EXACTLY:
 *  - listScanners / findScannerByIdPopulatedLean use `.lean()` (admin list/detail).
 *  - findScannerById is HYDRATED (regen-password mutate-then-save).
 *  - findActiveScannerByUsername / findActiveScanners are HYDRATED and populated
 *    (the auth middleware reads `passwordHash` for bcrypt.compare, so NOT lean).
 */

import { ApiClient, FaceScanner } from "../../models/index.js"

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Populate chain shared by the FaceScanner reads that return hostel + caterer.
const withScannerRefs = (query) =>
  query.populate("hostelId", "name type").populate("catererId", "name email")

export const scannerQueries = {
  // ==================== ApiClient ====================

  /** All API clients (bare find, no sort — as before). */
  async listApiClients() {
    return ApiClient.find()
  },

  /** Count API clients matching an optional filter (total / active). */
  async countApiClients(filter = {}) {
    return ApiClient.countDocuments(filter)
  },

  // ==================== FaceScanner ====================

  /** Admin list of scanners (filtered), hostel+caterer populated, newest first, LEAN. */
  async listScanners(query) {
    return withScannerRefs(FaceScanner.find(query)).sort({ createdAt: -1 }).lean()
  },

  /** One scanner by id, hostel+caterer populated, LEAN (admin detail). */
  async findScannerByIdPopulatedLean(id) {
    return withScannerRefs(FaceScanner.findById(id)).lean()
  },

  /** One scanner by id, HYDRATED (regen-password: mutate-then-save). */
  async findScannerById(id) {
    return FaceScanner.findById(id)
  },

  /**
   * Active scanner by exact (case-insensitive) username, hostel+caterer
   * populated, HYDRATED (auth: passwordHash needed for bcrypt.compare).
   */
  async findActiveScannerByUsername(username) {
    return withScannerRefs(
      FaceScanner.findOne({
        isActive: true,
        username: new RegExp(`^${escapeRegExp(username)}$`, "i"),
      })
    )
  },

  /** All active scanners, hostel+caterer populated, HYDRATED (header-auth scan). */
  async findActiveScanners() {
    return withScannerRefs(FaceScanner.find({ isActive: true }))
  },
}

export default scannerQueries
