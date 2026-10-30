/**
 * Dining Menu Queries
 * -------------------
 * The single READ surface for DiningMenuWeek + DiningMenuDay (writes live in
 * menuOwner.service.js). Returns raw lean docs; resolution into a day's menu
 * lives in menuResolve.js.
 */

import { DiningMenuWeek, DiningMenuDay } from "../../models/index.js"

const UPDATED_BY_POPULATE = { path: "updatedBy", select: "name" }

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Items of a collection as { name, diet } rows; `path` is the meals array path. */
const itemRows = (path, match) => [
  ...(path === "days.meals" ? [{ $unwind: "$days" }] : []),
  { $unwind: `$${path}` },
  { $unwind: `$${path}.items` },
  { $project: { _id: 0, name: `$${path}.items.name`, diet: `$${path}.items.diet` } },
  ...(match ? [{ $match: { name: match } }] : []),
]

export const menuQueries = {
  // ---- DiningMenuWeek ----

  /** Every version of one caterer, newest effectiveFrom first, updatedBy name populated. */
  async findWeekVersions(catererId) {
    return DiningMenuWeek.find({ catererId }).sort({ effectiveFrom: -1 }).populate(UPDATED_BY_POPULATE).lean()
  },

  /** One version by (catererId, effectiveFrom), updatedBy name populated. */
  async findWeekVersion(catererId, effectiveFrom) {
    return DiningMenuWeek.findOne({ catererId, effectiveFrom }).populate(UPDATED_BY_POPULATE).lean()
  },

  /** The version in effect on `day`: the latest with effectiveFrom <= day, or null. */
  async findWeekInEffect(catererId, day) {
    return DiningMenuWeek.findOne({ catererId, effectiveFrom: { $lte: day } }).sort({ effectiveFrom: -1 }).lean()
  },

  /**
   * The versions that can apply to some day in [from, to] for one caterer:
   * the one in effect on `from` plus any starting inside the range. Ascending.
   */
  async findWeeksForRange(catererId, from, to) {
    const [first, inside] = await Promise.all([
      DiningMenuWeek.findOne({ catererId, effectiveFrom: { $lte: from } }).sort({ effectiveFrom: -1 }).lean(),
      DiningMenuWeek.find({ catererId, effectiveFrom: { $gt: from, $lte: to } }).sort({ effectiveFrom: 1 }).lean(),
    ])
    return first ? [first, ...inside] : inside
  },

  // ---- DiningMenuDay ----

  /** Date overrides of some caterers on these date keys. */
  async findDayOverrides(catererIds, dates) {
    if (!catererIds.length || !dates.length) return []
    return DiningMenuDay.find({ catererId: { $in: catererIds }, date: { $in: dates } }).lean()
  },

  // ---- Both ----

  /**
   * Distinct item names (case-insensitive) across every version and override,
   * with their use count and diet tallies. `q` matches anywhere in the name;
   * prefix matches rank first, then the most used. Returns
   * [{ key, name, uses, diets: [{ diet, uses }] }].
   */
  async searchItems({ q = "", limit = 20 } = {}) {
    const needle = q.trim().toLowerCase()
    const match = needle ? new RegExp(escapeRegex(needle), "i") : null
    return DiningMenuWeek.aggregate([
      ...itemRows("days.meals", match),
      { $unionWith: { coll: DiningMenuDay.collection.name, pipeline: itemRows("meals", match) } },
      { $addFields: { key: { $toLower: { $trim: { input: "$name" } } } } },
      { $group: { _id: { key: "$key", diet: { $ifNull: ["$diet", ""] } }, name: { $first: "$name" }, uses: { $sum: 1 } } },
      { $sort: { uses: -1 } },
      {
        $group: {
          _id: "$_id.key",
          name: { $first: "$name" },
          uses: { $sum: "$uses" },
          diets: { $push: { diet: "$_id.diet", uses: "$uses" } },
        },
      },
      { $addFields: { prefix: needle ? { $eq: [{ $indexOfCP: ["$_id", needle] }, 0] } : false } },
      { $sort: { prefix: -1, uses: -1, _id: 1 } },
      { $limit: limit },
      { $project: { _id: 0, key: "$_id", name: 1, uses: 1, diets: 1 } },
    ])
  },
}

export default menuQueries
