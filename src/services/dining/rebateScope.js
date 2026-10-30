/**
 * Rebates are standalone date ranges per student: they no longer belong to a
 * dining period or caterer. A rebate counts for a caterer on the days a student
 * allocated to that caterer has it, inside the allocation's period. These
 * helpers build that "who + which days" filter once, so every reader scopes
 * rebates the same way.
 *
 * A scope is { studentUserIds, fromKey, toKey } — the students allocated in one
 * period (optionally one caterer) and that period's day keys (YYYY-MM-DD).
 */

import mongoose from "mongoose"

const toObjectId = (value) => (value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value?._id || value)))

/**
 * Mongo filter matching rebates of the scopes' students that touch the scopes'
 * days. Ids are cast to ObjectId so the filter also works in aggregations.
 * Returns null when no scope has students (callers skip the query).
 */
export const rebateScopeFilter = (scopes = [], { status } = {}) => {
  const clauses = scopes
    .filter((scope) => scope?.studentUserIds?.length && scope.fromKey && scope.toKey && scope.fromKey <= scope.toKey)
    .map((scope) => ({
      studentUserId: { $in: [...new Set(scope.studentUserIds.map(String))].map(toObjectId) },
      dateKeys: { $elemMatch: { $gte: scope.fromKey, $lte: scope.toKey } },
    }))
  if (!clauses.length) return null
  const filter = clauses.length === 1 ? clauses[0] : { $or: clauses }
  if (status) filter.status = Array.isArray(status) ? { $in: status } : status
  return filter
}

/** The rebate's day keys that fall inside [fromKey, toKey]. */
export const keysInRange = (rebate, fromKey, toKey) =>
  (Array.isArray(rebate?.dateKeys) ? rebate.dateKeys : []).filter((key) => key >= fromKey && key <= toKey)

/** The same rebate with dateKeys/dayCount clipped to [fromKey, toKey]. */
export const clipRebate = (rebate, fromKey, toKey) => {
  const dateKeys = keysInRange(rebate, fromKey, toKey)
  return { ...rebate, dateKeys, dayCount: dateKeys.length }
}

/** A period's day keys as stored: period dates are UTC midnight (same as getDayKey). */
const utcDayKey = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ""
}

/**
 * { fromKey, toKey } of a dining period. `keyOf` lets a module that buckets
 * period days with its own helper (e.g. the caterer modules' server-local
 * dayKey) stay consistent with its period selection; defaults to UTC keys.
 */
export const periodKeyRange = (period, keyOf = utcDayKey) => ({ fromKey: keyOf(period?.startDate), toKey: keyOf(period?.endDate) })

/**
 * One scope per period from allocation rows ({ periodId, studentUserId }):
 * the period's students and its day keys, optionally narrowed to [from, to].
 * Each scope also carries `periodId` for the caller's bucketing.
 */
export const allocationScopes = (periods = [], allocations = [], { keyOf, from, to } = {}) => {
  const studentsByPeriod = new Map()
  for (const allocation of allocations) {
    const periodId = String(allocation.periodId?._id || allocation.periodId)
    if (!studentsByPeriod.has(periodId)) studentsByPeriod.set(periodId, [])
    studentsByPeriod.get(periodId).push(allocation.studentUserId)
  }
  return periods.map((period) => {
    const periodId = String(period._id || period.id)
    const range = periodKeyRange(period, keyOf)
    return {
      periodId,
      studentUserIds: studentsByPeriod.get(periodId) || [],
      fromKey: from && from > range.fromKey ? from : range.fromKey,
      toKey: to && to < range.toKey ? to : range.toKey,
    }
  })
}

export default { rebateScopeFilter, keysInRange, clipRebate, periodKeyRange, allocationScopes }
