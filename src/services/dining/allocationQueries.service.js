/**
 * Dining Allocation Queries Service
 * ---------------------------------
 * The single READ surface for the DiningAllocation collection. Every module
 * that reads student -> caterer allocations calls these methods instead of
 * importing the model, so DiningAllocation is touched only inside
 * src/services/dining/ (writes live in allocationOwner.service.js).
 */

import { DiningAllocation } from "../../models/index.js"

const CATERER_POPULATE = { path: "catererId", select: "name email" }
// Student identity for admin caterer-list views (name lives on the User).
const STUDENT_POPULATE = {
  path: "studentProfileId",
  select: "rollNumber department degree batch userId",
  populate: { path: "userId", select: "name email profileImage" },
}

export const allocationQueries = {
  /** All period/caterer rosters for insights, in one read. */
  async findAllocationRostersByPeriods(periodIds) {
    return DiningAllocation.find({ periodId: { $in: periodIds } })
      .select("periodId catererId studentUserId unregistered")
      .lean()
  },
  /** Bulk roster summaries for caterer calendars, without per-period reads. */
  async findCatererAllocationsByPeriods(catererId, periodIds) {
    return DiningAllocation.find({ catererId, periodId: { $in: periodIds } })
      .select("periodId studentUserId studentProfileId rollNumber unregistered")
      .lean()
  },

  // ==================== Period-scoped ====================

  /** All allocations for a period (optionally with student identity populated). */
  async findAllocationsByPeriod(periodId, { populateStudent = false } = {}) {
    const query = DiningAllocation.find({ periodId })
    if (populateStudent) query.populate(STUDENT_POPULATE)
    return query.lean()
  },

  /** All allocations for one caterer in a period, sorted by roll number. */
  async findAllocationsByPeriodAndCaterer(periodId, catererId, { populateStudent = false } = {}) {
    const query = DiningAllocation.find({ periodId, catererId }).sort({ rollNumber: 1 })
    if (populateStudent) query.populate(STUDENT_POPULATE)
    return query.lean()
  },

  /** One student's allocation in a period (caterer optionally populated). */
  async findAllocation(periodId, studentUserId, { populateCaterer = false } = {}) {
    const query = DiningAllocation.findOne({ periodId, studentUserId })
    if (populateCaterer) query.populate(CATERER_POPULATE)
    return query.lean()
  },

  /** Count of allocations in a period. */
  async countAllocationsByPeriod(periodId) {
    return DiningAllocation.countDocuments({ periodId })
  },

  /** Count of allocations for one caterer in a period. */
  async countAllocationsByPeriodAndCaterer(periodId, catererId) {
    return DiningAllocation.countDocuments({ periodId, catererId })
  },

  /** Allocation counts per (period, caterer) — billing-cycle list. */
  async countAllocationsByPeriodsAndCaterer(periodIds) {
    return DiningAllocation.aggregate([
      { $match: { periodId: { $in: periodIds } } },
      { $group: { _id: { periodId: "$periodId", catererId: "$catererId" }, count: { $sum: 1 } } },
    ])
  },

  /** One period's allocations with caterer — billing-cycle detail. */
  async findCycleAllocations(periodId) {
    return DiningAllocation.find({ periodId })
      .select("studentUserId studentProfileId rollNumber catererId selectedAt unregistered")
      .lean()
  },

  /** Lean allocation summaries across periods (billing charge derivation). */
  async findAllocationSummariesByPeriods(periodIds) {
    return DiningAllocation.find({ periodId: { $in: periodIds } })
      .select("periodId studentUserId studentProfileId rollNumber unregistered")
      .lean()
  },

  // ==================== Student-scoped ====================

  /** The periodIds a student is allocated in (optionally limited to some periods). */
  async findAllocationPeriodIdsByUser(studentUserId, periodIds = null) {
    const filter = { studentUserId }
    if (periodIds) filter.periodId = { $in: periodIds }
    return DiningAllocation.find(filter).select("periodId unregistered").lean()
  },

  /** Every allocation a student has had (optionally one caterer's), caterer populated — allocation history. */
  async findAllocationHistoryByUser(studentUserId, { catererId } = {}) {
    const filter = { studentUserId }
    if (catererId) filter.catererId = catererId
    return DiningAllocation.find(filter)
      .select("periodId catererId selectedAt unregistered")
      .populate(CATERER_POPULATE)
      .lean()
  },

  /** A student's allocations for a set of periods (rebate cross-period checks). */
  async findAllocationsByUserAndPeriods(studentUserId, periodIds) {
    return DiningAllocation.find({ studentUserId, periodId: { $in: periodIds } }).lean()
  },

  /** A student's allocations for a set of periods, caterer populated (portal). */
  async findUserAllocationsByPeriods(studentUserId, periodIds) {
    return DiningAllocation.find({ periodId: { $in: periodIds }, studentUserId })
      .populate(CATERER_POPULATE)
      .lean()
  },

  /** Many students' allocations across many periods, caterer name populated — rebate placements (one read per list). */
  async findAllocationsByUsersAndPeriods(studentUserIds, periodIds) {
    if (!studentUserIds?.length || !periodIds?.length) return []
    return DiningAllocation.find({ studentUserId: { $in: studentUserIds }, periodId: { $in: periodIds } })
      .select("periodId studentUserId catererId unregistered")
      .populate({ path: "catererId", select: "name" })
      .lean()
  },

  /** The periodIds where a student is marked unregistered (auto-allocated) — rebate block. */
  async findUnregisteredPeriodIdsByUser(studentUserId) {
    const rows = await DiningAllocation.find({ studentUserId, unregistered: true }).select("periodId").lean()
    return rows.map((row) => row.periodId)
  },

  /** One caterer's allocation rows in a period ({ studentUserId, unregistered }) — rebate attribution. */
  async findAttributionRowsByPeriodAndCaterer(periodId, catererId) {
    return DiningAllocation.find({ periodId, catererId }).select("studentUserId unregistered").lean()
  },
}

export default allocationQueries
