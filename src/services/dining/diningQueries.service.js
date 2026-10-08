/**
 * Dining Queries Service
 * ----------------------
 * The single READ surface for the dining "core" collections that were not
 * already owned by the allocation/billing services: Caterer, DiningOfficeStaff,
 * and (added incrementally) DiningPeriod / DiningRebate / DiningMealVerification.
 * Writes live in diningOwner.service.js. Callers read through these instead of
 * importing the models directly.
 *
 * Caterer is queried many ways, so it uses repository-style methods (filter built
 * by the caller); model access still stays owned here.
 */

import { Caterer, DiningOfficeStaff, DiningPeriod, DiningRebate, DiningMealVerification } from "../../models/index.js"

/**
 * The canonical populate shape for a meal-verification record (caterer names,
 * student profile + user, scanner). Applied to findById/find queries so the
 * serializer sees populated refs. Mirrors the old app-side populateVerificationQuery.
 */
const VERIFICATION_POPULATE = [
  { path: "catererId", select: "name email" },
  { path: "expectedCatererId", select: "name email" },
  {
    path: "studentProfileId",
    select: "rollNumber userId",
    populate: { path: "userId", select: "name email profileImage" },
  },
  { path: "scannerId", select: "name type" },
]

const populateVerification = (query) => {
  VERIFICATION_POPULATE.forEach((p) => {
    query = query.populate(p)
  })
  return query
}

/**
 * The canonical populate shape for a dining-rebate record (period settings,
 * caterer, student profile + user). Mirrors the old app-side populateRebateQuery
 * that lived in dining-rebate.service. Note: userId select is "name email" (no
 * profileImage — unlike the verification populate above).
 */
const REBATE_POPULATE = [
  { path: "periodId", select: "startDate endDate rebateSettings" },
  { path: "catererId", select: "name email" },
  {
    path: "studentProfileId",
    select: "rollNumber userId",
    populate: { path: "userId", select: "name email" },
  },
]

const populateRebate = (query) => {
  REBATE_POPULATE.forEach((p) => {
    query = query.populate(p)
  })
  return query
}

export const diningQueries = {
  // ---- Caterer (repository-style) ----

  /** One caterer by arbitrary filter. Options: { select, lean }. */
  async findOneCaterer(filter, { select, lean } = {}) {
    let query = Caterer.findOne(filter)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Caterers by arbitrary filter. Options: { select, lean, sort }. */
  async findCaterers(filter = {}, { select, lean, sort } = {}) {
    let query = Caterer.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (lean) query = query.lean()
    return query
  },

  /** One caterer by id. Options: { select, lean }. */
  async findCatererById(id, { select, lean } = {}) {
    let query = Caterer.findById(id)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Count caterers matching a filter. */
  async countCaterers(filter = {}) {
    return Caterer.countDocuments(filter)
  },

  // ---- DiningOfficeStaff ----

  /** All office-staff with userId (name/email/phone/image) populated, LEAN. */
  async listOfficeStaffPopulated() {
    return DiningOfficeStaff.find().populate("userId", "name email phone profileImage").lean()
  },

  /** One office-staff by id. Options: { select }. HYDRATED. */
  async findOfficeStaffById(id, { select } = {}) {
    let query = DiningOfficeStaff.findById(id)
    if (select) query = query.select(select)
    return query
  },

  // ---- DiningPeriod (repository-style; catererIds populate is the common shape) ----

  /** One dining period by filter. Options: { select, lean, sort, populate, session }. */
  async findOnePeriod(filter, { select, lean, sort, populate, session } = {}) {
    let query = DiningPeriod.findOne(filter)
    if (select) query = query.select(select)
    if (populate) query = query.populate(populate)
    if (sort) query = query.sort(sort)
    if (session) query = query.session(session)
    if (lean) query = query.lean()
    return query
  },

  /** One dining period by id. Options: { select, lean, populate }. */
  async findPeriodById(id, { select, lean, populate } = {}) {
    let query = DiningPeriod.findById(id)
    if (select) query = query.select(select)
    if (populate) query = query.populate(populate)
    if (lean) query = query.lean()
    return query
  },

  /** Dining periods by filter. Options: { select, lean, sort, populate }. */
  async findPeriods(filter = {}, { select, lean, sort, populate } = {}) {
    let query = DiningPeriod.find(filter)
    if (select) query = query.select(select)
    if (populate) query = query.populate(populate)
    if (sort) query = query.sort(sort)
    if (lean) query = query.lean()
    return query
  },

  /** Count dining periods matching a filter. */
  async countPeriods(filter = {}) {
    return DiningPeriod.countDocuments(filter)
  },

  // ---- DiningRebate ----

  /** Database-side search, status-independent counts, and pagination. */
  async findCatererRebatePage(filter, { search = "", status = "all", skip = 0, limit = 20 } = {}) {
    const pipeline = [{ $match: filter }]
    if (search) {
      const pattern = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      pipeline.push(
        { $lookup: { from: "users", localField: "studentUserId", foreignField: "_id", as: "studentUser" } },
        { $match: { $or: [{ rollNumber: { $regex: pattern, $options: "i" } }, { "studentUser.name": { $regex: pattern, $options: "i" } }] } },
      )
    }
    pipeline.push({ $facet: {
      counts: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
      entries: [
        ...(status === "all" ? [] : [{ $match: { status } }]),
        { $sort: { startDate: -1, createdAt: -1, _id: -1 } },
        { $skip: skip }, { $limit: limit }, { $project: { _id: 1 } },
      ],
    } })
    return (await DiningRebate.aggregate(pipeline))[0]
  },

  /** Rebates by filter. Options: { select, lean, sort }. */
  async findRebates(filter = {}, { select, lean, sort } = {}) {
    let query = DiningRebate.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (lean) query = query.lean()
    return query
  },

  /** Count rebates matching a filter (dashboard tiles). */
  async countRebates(filter = {}) {
    return DiningRebate.countDocuments(filter)
  },

  /** One rebate by filter. Options: { select, lean }. */
  async findOneRebate(filter, { select, lean } = {}) {
    let query = DiningRebate.findOne(filter)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** One rebate by id. Options: { select, lean }. HYDRATED by default (mutate-then-save). */
  async findRebateById(id, { select, lean } = {}) {
    let query = DiningRebate.findById(id)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** One rebate by id with the canonical populate. Options: { lean }. */
  async findRebateByIdPopulated(id, { lean } = {}) {
    let query = populateRebate(DiningRebate.findById(id))
    if (lean) query = query.lean()
    return query
  },

  /** Rebates by filter with the canonical populate. Options: { sort, skip, limit, lean }. */
  async findRebatesPopulated(filter = {}, { sort, skip, limit, lean } = {}) {
    let query = populateRebate(DiningRebate.find(filter))
    if (sort) query = query.sort(sort)
    if (skip) query = query.skip(skip)
    if (limit) query = query.limit(limit)
    if (lean) query = query.lean()
    return query
  },

  // ---- DiningMealVerification ----

  /** Bulk scan summaries for historical calendars (no identity population). */
  async findVerifications(filter = {}, { select, sort } = {}) {
    let query = DiningMealVerification.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    return query.lean()
  },

  /** One verification by id, with the canonical populate. Options: { lean }. */
  async findVerificationByIdPopulated(id, { lean } = {}) {
    let query = populateVerification(DiningMealVerification.findById(id))
    if (lean) query = query.lean()
    return query
  },

  /** Verifications by filter, with the canonical populate. Options: { sort, skip, limit, lean }. */
  async findVerificationsPopulated(filter = {}, { sort, skip, limit, lean } = {}) {
    let query = populateVerification(DiningMealVerification.find(filter))
    if (sort) query = query.sort(sort)
    if (skip) query = query.skip(skip)
    if (limit) query = query.limit(limit)
    if (lean) query = query.lean()
    return query
  },

  /** One verification by filter (no populate). Options: { select, lean }. */
  async findOneVerification(filter, { select, lean } = {}) {
    let query = DiningMealVerification.findOne(filter)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Count verifications matching a filter. */
  async countVerifications(filter = {}) {
    return DiningMealVerification.countDocuments(filter)
  },
}

export default diningQueries
