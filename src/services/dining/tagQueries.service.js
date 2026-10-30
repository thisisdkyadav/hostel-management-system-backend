/**
 * Dining Tag Queries
 * ------------------
 * The single READ surface for DiningTag + DiningTagValue (writes live in
 * tagOwner.service.js). Returns raw lean docs / counts.
 */

import mongoose from "mongoose"
import { DiningTag, DiningTagValue } from "../../models/index.js"

export const tagQueries = {
  /** One tag by id (lean). */
  async findTagById(id) {
    return DiningTag.findById(id).lean()
  },

  /** Tags by filter, ordered for display. Options: { sort }. */
  async findTags(filter = {}, { sort = { order: 1, createdAt: 1 } } = {}) {
    return DiningTag.find(filter).sort(sort).lean()
  },

  /** Live allocation tags of some periods. */
  async findPeriodTags(periodIds) {
    return DiningTag.find({ kind: "period", periodId: { $in: periodIds }, isArchived: false })
      .sort({ order: 1, createdAt: 1 })
      .lean()
  },

  /**
   * Every live tag that applies somewhere in [from, to] (UTC-midnight calendar
   * days): the allocation tags of `periodIds` plus standalone tags overlapping
   * the range.
   */
  async findTagsInRange({ periodIds = [], from, to }) {
    const or = [{ kind: "standalone", startDate: { $lte: to }, endDate: { $gte: from } }]
    if (periodIds.length) or.push({ kind: "period", periodId: { $in: periodIds } })
    return DiningTag.find({ isArchived: false, $or: or }).sort({ kind: 1, order: 1, createdAt: 1 }).lean()
  },

  /** Standalone tags whose form is open at `now`. */
  async findOpenFormTags(now = new Date()) {
    return DiningTag.find({
      kind: "standalone",
      isArchived: false,
      "form.enabled": true,
      "form.opensAt": { $lte: now },
      "form.closesAt": { $gte: now },
    }).sort({ "form.closesAt": 1 }).lean()
  },

  /** Explicit answers of some students for some tags. */
  async findValues({ tagIds, studentUserIds }) {
    const filter = { tagId: { $in: tagIds } }
    if (studentUserIds) filter.studentUserId = { $in: studentUserIds }
    return DiningTagValue.find(filter).select("tagId studentUserId value source updatedAt").lean()
  },

  /** All answers of one tag (values page). */
  async findValuesByTag(tagId) {
    return DiningTagValue.find({ tagId }).select("studentUserId studentProfileId rollNumber value source updatedBy updatedAt").lean()
  },

  /** One student's answer for one tag. */
  async findValue(tagId, studentUserId) {
    return DiningTagValue.findOne({ tagId, studentUserId }).lean()
  },

  /** yes/no counts per tag: [{ _id: { tagId, value }, count }]. */
  async countValuesByTags(tagIds) {
    return DiningTagValue.aggregate([
      { $match: { tagId: { $in: tagIds } } },
      { $group: { _id: { tagId: "$tagId", value: "$value" }, count: { $sum: 1 } } },
    ])
  },

  /** Answer counts keyed by tag id: Map(id -> { yes, no, answered }). One aggregate for any number of tags. */
  async countsByTag(tagIds = []) {
    const counts = new Map(tagIds.map((id) => [String(id), { yes: 0, no: 0, answered: 0 }]))
    if (!tagIds.length) return counts
    const rows = await DiningTagValue.aggregate([
      { $match: { tagId: { $in: tagIds.map((id) => new mongoose.Types.ObjectId(String(id))) } } },
      { $group: { _id: { tagId: "$tagId", value: "$value" }, count: { $sum: 1 } } },
    ])
    rows.forEach(({ _id, count }) => {
      const entry = counts.get(String(_id.tagId)) || { yes: 0, no: 0, answered: 0 }
      if (_id.value === true) entry.yes += count
      else entry.no += count
      entry.answered += count
      counts.set(String(_id.tagId), entry)
    })
    return counts
  },

  /** Live tags of one kind whose name equals `name` case-insensitively (uniqueness checks). Extra filter merges in. */
  async findLiveTagsByName(name, filter = {}) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return DiningTag.find({ ...filter, isArchived: false, name: { $regex: new RegExp(`^${escaped}$`, "i") } }).lean()
  },

  /** One student's explicit answers for some tags. */
  async findStudentValues(studentUserId, tagIds = []) {
    if (!tagIds.length) return []
    return DiningTagValue.find({ studentUserId, tagId: { $in: tagIds } }).select("tagId value source updatedAt").lean()
  },
}

export default tagQueries
