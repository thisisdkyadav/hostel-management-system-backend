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

  /** EasyWDMS photos HMS hasn't stored yet (or whose EasyWDMS copy changed since). */
  async findFaceImportCandidates({ limit = 500 } = {}) {
    return DiningScannerUser.aggregate([
      { $match: { onScanner: true, "bioPhoto.present": true, "bioPhoto.path": { $ne: "" } } },
      { $addFields: { _key: { $concat: ["$bioPhoto.path", "@", { $ifNull: ["$bioPhoto.registeredAt", ""] }] } } },
      {
        $match: {
          $expr: {
            $and: [
              { $ne: [{ $ifNull: ["$face.sourceKey", ""] }, "$_key"] },
              // never overwrite a face HMS got from a student request / profile photo
              { $in: [{ $ifNull: ["$face.source", ""] }, ["", "easywdms"]] },
            ],
          },
        },
      },
      { $sort: { rollNumber: 1 } },
      { $limit: limit },
      { $project: { rollNumber: 1, bioPhoto: 1, _key: 1 } },
    ])
  },

  async countFaces() {
    const [stored, withoutFace] = await Promise.all([
      DiningScannerUser.countDocuments({ "face.ref": { $nin: ["", null] } }),
      DiningScannerUser.countDocuments({ onScanner: true, "bioPhoto.present": true, "face.ref": { $in: ["", null] } }),
    ])
    return { stored, withoutFace }
  },

  async findScannerUser(rollNumber) {
    return DiningScannerUser.findOne({ rollNumber }).lean()
  },

  /** Existing rows for a set of roll numbers (sync keeps earlier machine answers). */
  async findScannerUsersByRoll(rollNumbers) {
    return DiningScannerUser.find({ rollNumber: { $in: rollNumbers } })
      .select("rollNumber bioPhoto devices devicesChecked")
      .lean()
  },

  /** Smallest command id a machine hasn't answered yet (0 when none). */
  async findOldestUnansweredCommandId() {
    const [row] = await DiningScannerUser.aggregate([
      { $match: { onScanner: true, "devices.ok": null, "devices.commandId": { $gt: 0 } } },
      { $unwind: "$devices" },
      { $match: { "devices.ok": null, "devices.commandId": { $gt: 0 } } },
      { $group: { _id: null, id: { $min: "$devices.commandId" } } },
    ])
    return row?.id || 0
  },

  /** One page of scanner users for a ready filter, by roll number. */
  async findScannerUserPage(filter, { page = 1, limit = 50 } = {}) {
    const [items, total] = await Promise.all([
      DiningScannerUser.find(filter).sort({ rollNumber: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      DiningScannerUser.countDocuments(filter),
    ])
    return { items, total }
  },

  /** Counts for the page's tabs (users currently on the scanner). */
  async countScannerUsers() {
    const [byStatus, notInHms, total] = await Promise.all([
      DiningScannerUser.aggregate([{ $match: { onScanner: true } }, { $group: { _id: "$photoStatus", count: { $sum: 1 } } }]),
      DiningScannerUser.countDocuments({ onScanner: true, studentUserId: null }),
      DiningScannerUser.countDocuments({ onScanner: true }),
    ])
    const counts = { all: total, notInHms, valid: 0, pending: 0, failed: 0, missing: 0 }
    for (const row of byStatus) if (row._id in counts) counts[row._id] = row.count
    return counts
  },

  /** Scanner users the bulk "use profile photos" run should try. */
  async findProfilePhotoCandidates({ limit = 5000 } = {}) {
    return DiningScannerUser.find({
      onScanner: true,
      studentUserId: { $ne: null },
      photoStatus: "missing",
      "profileAttempt.at": null,
    })
      .sort({ rollNumber: 1 })
      .limit(limit)
      .select("rollNumber studentUserId")
      .lean()
  },
}

export default bioPhotoQueries
