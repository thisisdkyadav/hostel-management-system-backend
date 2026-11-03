/**
 * Dining Bio-Photo Queries
 * ------------------------
 * The single READ surface for the face-scanner domain: DiningBioPhotoRequest
 * and DiningScannerUser (writes live in bioPhotoOwner.service.js). Returns lean docs.
 */

import mongoose from "mongoose"
import { DiningBioPhotoRequest, DiningScannerUser } from "../../models/index.js"
import { BIO_PHOTO_STATUSES } from "../../models/dining/DiningBioPhotoRequest.model.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value?._id || value))

export const bioPhotoQueries = {
  async findById(requestId) {
    if (!mongoose.isValidObjectId(requestId)) return null
    return DiningBioPhotoRequest.findById(requestId).lean()
  },

  /** A student's requests, newest first (optionally one status). */
  async findByStudent(studentUserId, { limit = 10, status } = {}) {
    const filter = { studentUserId: toObjectId(studentUserId), ...(status ? { status } : {}) }
    return DiningBioPhotoRequest.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
  },

  /**
   * One page of requests. `filter` is a ready Mongo filter built by the caller
   * (status / roll number / student ids). Pending sorts oldest first (a queue),
   * everything else newest first.
   */
  async findPage(filter, { page = 1, limit = 25, oldestFirst = false } = {}) {
    const [items, total] = await Promise.all([
      DiningBioPhotoRequest.find(filter)
        .sort({ createdAt: oldestFirst ? 1 : -1, _id: oldestFirst ? 1 : -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      DiningBioPhotoRequest.countDocuments(filter),
    ])
    return { items, total }
  },

  /** { pending, approved, rejected, cancelled } counts. */
  async countByStatus() {
    const rows = await DiningBioPhotoRequest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    const counts = Object.fromEntries(BIO_PHOTO_STATUSES.map((status) => [status, 0]))
    for (const row of rows) if (row._id in counts) counts[row._id] = row.count
    return counts
  },

  // ---------------------------------------------------------------- scanner users

  async countFaces() {
    return { stored: await DiningScannerUser.countDocuments({ "face.ref": { $nin: ["", null] } }) }
  },

  /** Face and profile-photo attempt per roll, for the scanner-photo page (optionally one roll). */
  async findPhotoBoardRows({ rollNumber } = {}) {
    return DiningScannerUser.find(rollNumber ? { rollNumber } : { $or: [{ "face.ref": { $nin: ["", null] } }, { "profileAttempt.at": { $ne: null } }] })
      .select("rollNumber face profileAttempt")
      .lean()
  },

  /** Rolls whose profile photo was already tried (the bulk run skips them). */
  async findProfileAttemptedRolls() {
    const rows = await DiningScannerUser.find({ "profileAttempt.at": { $ne: null } }).select("rollNumber").lean()
    return rows.map((row) => row.rollNumber)
  },

  /** Every scanner-user row's roll, EasyWDMS presence and HMS face (face-machine roster sync). */
  async findRosterFaces() {
    return DiningScannerUser.find({}).select("rollNumber name onScanner bioPhoto.present face").lean()
  },

  async findScannerUser(rollNumber) {
    return DiningScannerUser.findOne({ rollNumber }).lean()
  },
}

export default bioPhotoQueries
