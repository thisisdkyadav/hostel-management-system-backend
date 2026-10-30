/**
 * Dining Tag Owner Service
 * ------------------------
 * The single WRITE surface for DiningTag + DiningTagValue (reads live in
 * tagQueries.service.js). Callers validate payloads and resolve student
 * identity; this service only persists.
 *
 * - Tags: create / update / archive. Period tags are written only through
 *   syncPeriodTags (the period form), standalone tags through the Tags page.
 * - Values: one row per (tagId, studentUserId), upserted with the source
 *   ("student" | "admin" | "csv") and who set it. Clearing an answer deletes
 *   the row so the tag's defaultValue applies again.
 */

import mongoose from "mongoose"
import { DiningTag, DiningTagValue } from "../../models/index.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value?._id || value))

const normalizeRoll = (value) => String(value || "").trim().toUpperCase()

/** Run `fn(session)` in the caller's session, or in a fresh transaction. */
const inSession = async (session, fn) => {
  if (session) return fn(session)
  const own = await mongoose.startSession()
  try {
    let result
    await own.withTransaction(async () => {
      result = await fn(own)
    })
    return result
  } finally {
    await own.endSession()
  }
}

export const tagOwner = {
  // ---- DiningTag ----

  /** Create a tag. Returns the lean doc. */
  async createTag(data, { session } = {}) {
    const [doc] = await DiningTag.create([data], session ? { session } : {})
    return doc.toObject()
  },

  /** $set fields on a tag. Returns the updated lean doc or null. */
  async updateTag(id, updates, { session } = {}) {
    return DiningTag.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true, session }).lean()
  },

  /** Archive / unarchive a tag (answers are kept). Returns the updated lean doc or null. */
  async setTagArchived(id, isArchived, { session } = {}) {
    return DiningTag.findByIdAndUpdate(id, { $set: { isArchived: Boolean(isArchived) } }, { new: true, session }).lean()
  },

  /**
   * Make a period's live allocation tags match `tags` (already validated:
   * [{ id?, name, question, defaultValue }], in display order). Entries with an
   * id update that tag (reviving it if it was archived), new entries are
   * created, live tags missing from the list are archived (answers kept).
   * Runs in `session` when given, else in its own transaction.
   * Returns the period's live tags, ordered.
   */
  async syncPeriodTags(periodId, tags = [], { session, actor } = {}) {
    const periodObjectId = toObjectId(periodId)
    return inSession(session, async (txn) => {
      const keepIds = []
      for (const [order, tag] of tags.entries()) {
        const fields = {
          name: tag.name,
          question: tag.question || "",
          defaultValue: Boolean(tag.defaultValue),
          order,
          isArchived: false,
        }
        if (tag.id) {
          const res = await DiningTag.updateOne(
            { _id: toObjectId(tag.id), kind: "period", periodId: periodObjectId },
            { $set: fields },
            { session: txn, runValidators: true }
          )
          if (res.matchedCount) {
            keepIds.push(toObjectId(tag.id))
            continue
          }
        }
        const [created] = await DiningTag.create(
          [{ ...fields, kind: "period", periodId: periodObjectId, createdBy: actor?._id || null }],
          { session: txn }
        )
        keepIds.push(created._id)
      }
      await DiningTag.updateMany(
        { kind: "period", periodId: periodObjectId, isArchived: false, _id: { $nin: keepIds } },
        { $set: { isArchived: true } },
        { session: txn }
      )
      return DiningTag.find({ kind: "period", periodId: periodObjectId, isArchived: false })
        .sort({ order: 1, createdAt: 1 })
        .session(txn)
        .lean()
    })
  },

  // ---- DiningTagValue ----

  /**
   * Upsert one student's answer (studentProfileId / rollNumber are denormalized for display).
   * Returns the lean value row.
   */
  async setValue({ tagId, studentUserId, studentProfileId = null, rollNumber = "", value, source, updatedBy = null }, { session } = {}) {
    return DiningTagValue.findOneAndUpdate(
      { tagId: toObjectId(tagId), studentUserId: toObjectId(studentUserId) },
      {
        $set: {
          value: Boolean(value),
          source,
          updatedBy: updatedBy ? toObjectId(updatedBy) : null,
          studentProfileId: studentProfileId ? toObjectId(studentProfileId) : null,
          rollNumber: normalizeRoll(rollNumber),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true, session }
    ).lean()
  },

  /** Several answers of one student (e.g. the caterer-selection questions). */
  async setStudentValues({ studentUserId, studentProfileId = null, rollNumber = "", answers = [], source, updatedBy = null }, { session } = {}) {
    if (!answers.length) return 0
    const ops = answers.map(({ tagId, value }) => ({
      updateOne: {
        filter: { tagId: toObjectId(tagId), studentUserId: toObjectId(studentUserId) },
        update: {
          $set: {
            value: Boolean(value),
            source,
            updatedBy: updatedBy ? toObjectId(updatedBy) : null,
            studentProfileId: studentProfileId ? toObjectId(studentProfileId) : null,
            rollNumber: normalizeRoll(rollNumber),
          },
        },
        upsert: true,
      },
    }))
    const res = await DiningTagValue.bulkWrite(ops, { session, ordered: false })
    return Number(res.upsertedCount || 0) + Number(res.matchedCount || 0)
  },

  /** Remove a student's answer (the tag's defaultValue applies again). Returns true if a row was removed. */
  async clearValue(tagId, studentUserId, { session } = {}) {
    const res = await DiningTagValue.deleteOne({ tagId: toObjectId(tagId), studentUserId: toObjectId(studentUserId) }, { session })
    return Number(res.deletedCount || 0) > 0
  },

  /**
   * Upsert many answers of one tag. rows = [{ studentUserId, studentProfileId?, rollNumber?, value }].
   * Returns the number of rows written (inserted + matched).
   */
  async bulkSetValues(tagId, rows = [], { source, updatedBy = null, session } = {}) {
    if (!rows.length) return 0
    const tagObjectId = toObjectId(tagId)
    const updatedByObjectId = updatedBy ? toObjectId(updatedBy) : null
    const ops = rows.map((row) => ({
      updateOne: {
        filter: { tagId: tagObjectId, studentUserId: toObjectId(row.studentUserId) },
        update: {
          $set: {
            value: Boolean(row.value),
            source,
            updatedBy: updatedByObjectId,
            studentProfileId: row.studentProfileId ? toObjectId(row.studentProfileId) : null,
            rollNumber: normalizeRoll(row.rollNumber),
          },
        },
        upsert: true,
      },
    }))
    const res = await DiningTagValue.bulkWrite(ops, { session, ordered: false })
    return Number(res.upsertedCount || 0) + Number(res.matchedCount || 0)
  },
}

export default tagOwner
