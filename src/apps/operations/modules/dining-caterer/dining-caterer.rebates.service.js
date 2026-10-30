import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { serializeDiningRebate } from "../../../../services/dining/dining-rebate.service.js"
import { success } from "../../../../services/base/index.js"
import { loadTagContext } from "../../../../services/dining/tagResolve.js"
import { allocationScopes, keysInRange, periodKeyRange, rebateScopeFilter } from "../../../../services/dining/rebateScope.js"
import {
  idOf, dayKey, shiftDay, dayKeys, validateRange, getCatererScope, getPeriodScope,
  serializeCaterer, studentDetails, serializeStudent,
} from "./dining-caterer.service.js"

// Preserve the shared rebate serializer; only the new endpoints add the image.
const serializeRebate = (rebate, profile) => {
  const result = serializeDiningRebate(rebate)
  if (result.student) result.student.profileImage = profile?.userId?.profileImage || ""
  return result
}

/**
 * Rebates are standalone date ranges; a caterer sees the days of a rebate that
 * fall in its periods while the student is allocated to it. `rosters` is one
 * entry per caterer period: { period, fromKey, toKey, students:Set }.
 */
const buildRosters = (periods, allocations) => {
  const students = new Map()
  for (const allocation of allocations) {
    const id = idOf(allocation.periodId)
    if (!students.has(id)) students.set(id, new Set())
    students.get(id).add(idOf(allocation.studentUserId))
  }
  return periods
    .map((period) => ({ period, ...periodKeyRange(period, dayKey), students: students.get(idOf(period)) || new Set() }))
    .sort((a, b) => (a.fromKey < b.fromKey ? -1 : a.fromKey > b.fromKey ? 1 : 0))
}

/** The rebate's placements at this caterer: one per period where the student is allocated here. */
const catererPlacements = (rebate, rosters, caterer) => rosters
  .filter((roster) => roster.students.has(idOf(rebate.studentUserId)))
  .map((roster) => ({ roster, dateKeys: keysInRange(rebate, roster.fromKey, roster.toKey) }))
  .filter(({ dateKeys }) => dateKeys.length)
  .map(({ roster, dateKeys }) => ({
    periodId: roster.period._id,
    period: { id: roster.period._id, startDate: roster.period.startDate, endDate: roster.period.endDate },
    caterer: { id: caterer._id, name: caterer.name },
    dayCount: dateKeys.length,
    dateKeys,
  }))

/**
 * The serialized rebate as THIS caterer sees it: period/caterer/dateKeys/dayCount
 * describe its placement here (the preferred period's, else the first), so the
 * caterer pages keep reading the fields they always did. `placements` lists them all.
 */
const serializeCatererRebate = (rebate, profile, { rosters, caterer, periodId = null }) => {
  const result = serializeRebate(rebate, profile)
  const placements = catererPlacements(rebate, rosters, caterer)
  if (!placements.length) return { ...result, placements }
  const primary = placements.find((placement) => idOf(placement.periodId) === idOf(periodId)) || placements[0]
  const dateKeys = periodId ? primary.dateKeys : placements.flatMap((placement) => placement.dateKeys)
  return {
    ...result,
    periodId: primary.periodId, period: primary.period,
    catererId: caterer._id, caterer: { id: caterer._id, name: caterer.name, email: caterer.email },
    dateKeys, dayCount: dateKeys.length, placements,
  }
}

/** One bulk query per collection for the entire calendar, including yesterday. */
const loadCalendar = async (caterer, from, to, { populate = false } = {}) => {
  const periods = await diningQueries.findPeriods({ catererIds: caterer._id, isArchived: false }, { lean: true, sort: { startDate: -1, _id: -1 } })
  const inRange = periods.filter((period) => dayKey(period.startDate) <= to && dayKey(period.endDate) >= from)
  const periodIds = inRange.map((period) => period._id)
  const allocations = periodIds.length ? await allocationQueries.findCatererAllocationsByPeriods(caterer._id, periodIds) : []
  // Each period's roster, over its days in [from, to] plus the day before (for "returning").
  const scopes = allocationScopes(inRange, allocations, { keyOf: dayKey, from, to })
    .map((scope) => ({ ...scope, fromKey: scope.fromKey ? shiftDay(scope.fromKey, -1) : scope.fromKey }))
  const filter = rebateScopeFilter(scopes, { status: ["approved", "pending"] })
  const sort = { startDate: -1, _id: -1 }
  const rebates = !filter ? [] : populate
    ? await diningQueries.findRebatesPopulated(filter, { lean: true, sort })
    : await diningQueries.findRebates(filter, { lean: true, sort })
  const rosterByPeriod = new Map()
  const rebatesByPeriod = new Map()
  for (const allocation of allocations) {
    const id = idOf(allocation.periodId)
    if (!rosterByPeriod.has(id)) rosterByPeriod.set(id, new Set())
    rosterByPeriod.get(id).add(idOf(allocation.studentUserId))
  }
  // A rebate belongs to every period whose roster (here) has its student; calendarDay checks the day.
  for (const scope of scopes) {
    const roster = rosterByPeriod.get(scope.periodId)
    if (!roster) continue
    rebatesByPeriod.set(scope.periodId, rebates.filter((rebate) => roster.has(idOf(rebate.studentUserId)) && keysInRange(rebate, scope.fromKey, scope.toKey).length))
  }
  // One tag context for the whole calendar: headcount per tag on each day.
  const tagContext = await loadTagContext({
    periods: inRange, fromKey: from, toKey: to,
    studentUserIds: allocations.map((allocation) => allocation.studentUserId),
  })
  return { periods, rosterByPeriod, rebatesByPeriod, tagContext, rosters: buildRosters(inRange, allocations) }
}

const uniqueStudents = (rebates) => [...new Map(rebates.map((rebate) => [idOf(rebate.studentUserId), rebate])).values()]
export const calendarDay = (calendar, date) => {
  // Latest startDate wins; _id provides a stable tie-break for identical starts.
  const period = calendar.periods.find((period) => dayKey(period.startDate) <= date && dayKey(period.endDate) >= date)
  const periodId = period ? idOf(period) : null
  const rebates = calendar.rebatesByPeriod.get(periodId) || []
  const approved = rebates.filter((rebate) => rebate.status === "approved")
  const onRebate = uniqueStudents(approved.filter((rebate) => rebate.dateKeys.includes(date)))
  const pending = uniqueStudents(rebates.filter((rebate) => rebate.status === "pending" && rebate.dateKeys.includes(date)))
  const starting = uniqueStudents(approved.filter((rebate) => rebate.dateKeys[0] === date))
  const yesterday = shiftDay(date, -1)
  const returning = uniqueStudents(approved.filter((rebate) => rebate.dateKeys.at(-1) === yesterday))
  const roster = calendar.rosterByPeriod.get(periodId)
  const allocatedCount = roster?.size || 0
  // Expected eaters with each tag that applies today (calendars built without tags skip it).
  let tagCounts
  if (calendar.tagContext) {
    const away = new Set(onRebate.map((rebate) => idOf(rebate.studentUserId)))
    const expected = [...(roster || [])].filter((userId) => !away.has(userId))
    tagCounts = calendar.tagContext.tagCountsOn(date, { periodId, userIds: expected })
  }
  return {
    counts: {
      date, periodId, allocatedCount, onRebateCount: onRebate.length, pendingCount: pending.length, expectedCount: Math.max(0, allocatedCount - onRebate.length),
      ...(tagCounts ? { tagCounts } : {}),
    },
    onRebate, pending, starting, returning,
  }
}

export const getRebateOverview = async ({ user, query }) => {
  const { caterer, error } = await getCatererScope(user, query)
  if (error) return error
  const today = dayKey()
  const from = query.from || today
  const to = query.to || shiftDay(today, 13)
  const validation = validateRange(from, to, 92)
  if (validation) return validation
  const calendar = await loadCalendar(caterer, from, to)
  return success({
    caterer: serializeCaterer(caterer), today, from, to,
    days: dayKeys(from, to).map((date) => {
      const day = calendarDay(calendar, date)
      return { ...day.counts, startingCount: day.starting.length, returningCount: day.returning.length }
    }),
  })
}

export const getRebateDay = async ({ user, query }) => {
  const { caterer, error } = await getCatererScope(user, query, { required: ["date"] })
  if (error) return error
  const calendar = await loadCalendar(caterer, query.date, query.date, { populate: true })
  const day = calendarDay(calendar, query.date)
  const rebates = [...day.onRebate, ...day.pending, ...day.starting, ...day.returning]
  const profiles = await studentDetails(rebates.map((rebate) => rebate.studentUserId))
  const entry = (rebate) => {
    const profile = profiles.get(idOf(rebate.studentUserId))
    const placed = serializeCatererRebate(rebate, profile, { rosters: calendar.rosters, caterer, periodId: day.counts.periodId })
    return { rebate: placed, student: serializeStudent(profile, rebate) }
  }
  return success({
    ...day.counts,
    onRebate: day.onRebate.map((rebate) => ({ ...entry(rebate), dayNumber: rebate.dateKeys.indexOf(query.date) + 1, dayCount: rebate.dayCount })),
    pending: day.pending.map(entry), starting: day.starting.map(entry), returning: day.returning.map(entry),
  })
}

export const getRebates = async ({ user, query }) => {
  const validation = { enums: { status: ["approved", "pending", "rejected", "all"] } }
  const { caterer, error } = await getCatererScope(user, query, validation)
  if (error) return error
  let periods
  if (query.periodId) {
    const scope = await getPeriodScope(user, query)
    if (scope.error) return scope.error
    periods = [scope.period]
  } else {
    periods = await diningQueries.findPeriods({ catererIds: caterer._id }, { lean: true, select: "_id startDate endDate" })
  }
  // Rebates of students allocated here, on days inside their period (and the from/to window).
  const allocations = periods.length ? await allocationQueries.findCatererAllocationsByPeriods(caterer._id, periods.map((period) => period._id)) : []
  const rosters = buildRosters(periods, allocations)
  // rebateScopeFilter casts ids to ObjectId: Mongoose does not cast aggregation filters.
  const filter = rebateScopeFilter(allocationScopes(periods, allocations, { keyOf: dayKey, from: query.from, to: query.to }))
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 20)
  const status = query.status || "all"
  const result = filter
    ? await diningQueries.findCatererRebatePage(filter, { search: query.search?.trim(), status, skip: (page - 1) * limit, limit })
    : { counts: [], entries: [] }
  const counts = { all: 0, approved: 0, pending: 0, rejected: 0 }
  for (const count of result.counts) {
    if (count._id in counts && count._id !== "all") counts[count._id] = count.count
    counts.all += count.count
  }
  const ids = result.entries.map((entry) => entry._id)
  const rebates = ids.length ? await diningQueries.findRebatesPopulated({ _id: { $in: ids } }, { lean: true, sort: { startDate: -1, createdAt: -1, _id: -1 } }) : []
  const profiles = await studentDetails(rebates.map((rebate) => rebate.studentUserId))
  const total = status === "all" ? counts.all : counts[status]
  return success({
    rebates: rebates.map((rebate) => serializeCatererRebate(rebate, profiles.get(idOf(rebate.studentUserId)), { rosters, caterer, periodId: query.periodId })),
    counts, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}
