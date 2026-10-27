/**
 * Scanner Queries Service
 * -----------------------
 * The single READ surface for the Scanner domain — the `ApiClient` and
 * `FaceScanner` / `ScannerAccount` collections. The super-admin service, the face-scanner service,
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

import { ApiClient, FaceScanner, ScannerAccount } from "../../models/index.js"

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Populate chain shared by the FaceScanner reads that return hostel + caterer.
const withScannerRefs = (query) =>
  query.populate("hostelId", "name type").populate("catererId", "name email")

export const scannerQueries = {
  async listAccounts() {
    return ScannerAccount.find().select("-passwordHash").sort({ createdAt: -1 }).lean()
  },

  async findAccountById(id, { session } = {}) {
    return ScannerAccount.findById(id).select("-passwordHash").session(session || null).lean()
  },

  // Only authentication and credential collision checks request a hydrated account.
  async findAccountByUsername(username, { session } = {}) {
    return ScannerAccount.findOne({ username }).collation({ locale: "en", strength: 2 }).session(session || null)
  },

  async listUnmigratedZktecoScanners() {
    return FaceScanner.find({ provider: "zkteco", accountId: null }).sort({ updatedAt: -1, _id: -1 }).lean()
  },

  async scannerIndexes() {
    try { return await FaceScanner.collection.indexes() }
    catch (err) { if (err.codeName === "NamespaceNotFound") return []; throw err }
  },

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
  async listScanners(query, { hidePasswordHash = false } = {}) {
    const find = FaceScanner.find(query)
    if (hidePasswordHash) find.select("-passwordHash")
    return withScannerRefs(find).populate("accountId", "name username isActive").sort({ createdAt: -1 }).lean()
  },

  /** One scanner by id, hostel+caterer populated, LEAN (admin detail). */
  async findScannerByIdPopulatedLean(id) {
    return withScannerRefs(FaceScanner.findById(id)).populate("accountId", "name username isActive").lean()
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
        provider: { $ne: "zkteco" },
        username: new RegExp(`^${escapeRegExp(username)}$`, "i"),
      })
    )
  },

  /** Active Time Watch/legacy scanners, populated and hydrated for header auth. */
  async findActiveScanners() {
    return withScannerRefs(FaceScanner.find({ isActive: true, provider: { $ne: "zkteco" } }))
  },

  /** ZKTeco identity is the exact terminal alias scoped to its authenticated account. */
  async findActiveZktecoScannersByDeviceNames(deviceNames, accountId) {
    return withScannerRefs(FaceScanner.find({ isActive: true, provider: "zkteco", accountId, deviceName: { $in: deviceNames } }))
  },

  async findScannersByUsername(username) {
    return FaceScanner.find({ username: new RegExp(`^${escapeRegExp(username)}$`, "i") })
  },

  /** Count scanners matching a filter (dashboard tallies). */
  async countScanners(filter = {}) {
    return FaceScanner.countDocuments(filter)
  },
}

export default scannerQueries
