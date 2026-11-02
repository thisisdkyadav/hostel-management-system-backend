/**
 * Dining Bio-Photo Owner Service
 * ------------------------------
 * The single WRITE surface for the face-scanner domain: DiningBioPhotoRequest
 * and DiningScannerUser (reads live in bioPhotoQueries.service.js). Callers validate input; every state change here
 * is a guarded findOneAndUpdate so a request only moves out of "pending" once.
 */

import mongoose from "mongoose"
import { DiningBioPhotoRequest, DiningScannerUser } from "../../models/index.js"

// A push holds the request for at most this long; a crashed push frees itself.
export const PUSH_LOCK_MS = 2 * 60 * 1000

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value?._id || value))

const AFTER = { returnDocument: "after", runValidators: true }

export const bioPhotoOwner = {
  /**
   * New pending request. Returns { request } or { duplicate: true } when the
   * student already has a pending one (partial unique index).
   */
  async createRequest({ studentUserId, studentProfileId, rollNumber, photo, note = "" }) {
    try {
      const doc = await DiningBioPhotoRequest.create({
        studentUserId: toObjectId(studentUserId),
        studentProfileId: toObjectId(studentProfileId),
        rollNumber,
        photo,
        note,
        status: "pending",
      })
      return { request: doc.toObject() }
    } catch (error) {
      if (error?.code === 11000) return { duplicate: true }
      throw error
    }
  },

  /** Student withdraws their own pending request. Returns the lean doc or null. */
  async cancelPending({ requestId, studentUserId }) {
    return DiningBioPhotoRequest.findOneAndUpdate(
      { _id: toObjectId(requestId), studentUserId: toObjectId(studentUserId), status: "pending" },
      { $set: { status: "cancelled" } },
      AFTER
    ).lean()
  },

  /**
   * Claim a pending request for a push: only when no live claim exists.
   * Returns the lean doc (with the new lockedAt) or null.
   */
  async claimForPush(requestId, now = new Date()) {
    return DiningBioPhotoRequest.findOneAndUpdate(
      {
        _id: toObjectId(requestId),
        status: "pending",
        $or: [{ "push.lockedAt": null }, { "push.lockedAt": { $lt: new Date(now.getTime() - PUSH_LOCK_MS) } }],
      },
      { $set: { "push.lockedAt": now } },
      AFTER
    ).lean()
  },

  /** The push succeeded: approve and release the claim. */
  async markPushed({ requestId, lockedAt, reviewerId, now = new Date() }) {
    return DiningBioPhotoRequest.findOneAndUpdate(
      { _id: toObjectId(requestId), status: "pending", "push.lockedAt": lockedAt },
      {
        $set: {
          status: "approved",
          reviewedBy: toObjectId(reviewerId),
          reviewedAt: now,
          reviewComment: "",
          "push.pushedAt": now,
          "push.lastAttemptAt": now,
          "push.lastError": "",
          "push.lockedAt": null,
        },
        $inc: { "push.attempts": 1 },
      },
      AFTER
    ).lean()
  },

  /** The push failed: stay pending, keep the error, release the claim. */
  async markPushFailed({ requestId, lockedAt, error, now = new Date() }) {
    return DiningBioPhotoRequest.findOneAndUpdate(
      { _id: toObjectId(requestId), status: "pending", "push.lockedAt": lockedAt },
      {
        $set: {
          "push.lastAttemptAt": now,
          "push.lastError": String(error || "Upload failed").slice(0, 500),
          "push.lockedAt": null,
        },
        $inc: { "push.attempts": 1 },
      },
      AFTER
    ).lean()
  },

  /** Reject a pending request that is not being pushed right now. */
  async reject({ requestId, reviewerId, comment, now = new Date() }) {
    return DiningBioPhotoRequest.findOneAndUpdate(
      {
        _id: toObjectId(requestId),
        status: "pending",
        $or: [{ "push.lockedAt": null }, { "push.lockedAt": { $lt: new Date(now.getTime() - PUSH_LOCK_MS) } }],
      },
      {
        $set: {
          status: "rejected",
          reviewedBy: toObjectId(reviewerId),
          reviewedAt: now,
          reviewComment: comment,
          "push.lockedAt": null,
        },
      },
      AFTER
    ).lean()
  },

  // ---------------------------------------------------------------- scanner users

  /**
   * Sync upserts: each row is { rollNumber, set } and becomes an upserted $set.
   * Rows are written in chunks so a 4–5k sync stays one round trip per chunk.
   */
  async upsertScannerUsers(rows = [], { chunkSize = 1000 } = {}) {
    let written = 0
    for (let index = 0; index < rows.length; index += chunkSize) {
      const ops = rows.slice(index, index + chunkSize).map(({ rollNumber, set }) => ({
        updateOne: { filter: { rollNumber }, update: { $set: { rollNumber, ...set } }, upsert: true },
      }))
      if (!ops.length) continue
      const result = await DiningScannerUser.bulkWrite(ops, { ordered: false })
      written += (result.upsertedCount || 0) + (result.modifiedCount || 0)
    }
    return written
  },

  /** Rows the sync no longer found in EasyWDMS stay, marked off-scanner. */
  async markOffScanner(presentRollNumbers = [], now = new Date()) {
    const result = await DiningScannerUser.updateMany(
      { rollNumber: { $nin: presentRollNumbers }, onScanner: true },
      { $set: { onScanner: false, syncedAt: now } }
    )
    return result.modifiedCount || 0
  },

  /** Upsert one scanner user's fields; returns the lean doc. */
  async upsertScannerUser(rollNumber, set = {}) {
    return DiningScannerUser.findOneAndUpdate(
      { rollNumber },
      { $set: { rollNumber, ...set } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
    ).lean()
  },
}

export default bioPhotoOwner
