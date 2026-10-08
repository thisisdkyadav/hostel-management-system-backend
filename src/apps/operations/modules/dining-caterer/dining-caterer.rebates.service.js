import mongoose from "mongoose"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { serializeDiningRebate } from "../../../../services/dining/dining-rebate.service.js"
import { success } from "../../../../services/base/index.js"
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

/** One bulk query per collection for the entire calendar, including yesterday. */
const loadCalendar = async (caterer, from, to, { populate = false } = {}) => {
  const periods = await diningQueries.findPeriods({ catererIds: caterer._id, isArchived: false }, { lean: true, sort: { startDate: -1, _id: -1 } })
  const periodIds = periods.filter((period) => dayKey(period.startDate) <= to && dayKey(period.endDate) >= from).map((period) => period._id)
  const filter = {
    catererId: caterer._id, periodId: { $in: periodIds }, status: { $in: ["approved", "pending"] },
    dateKeys: { $in: dayKeys(shiftDay(from, -1), to) },
  }
  const [allocations, rebates] = await Promise.all([
    allocationQueries.findCatererAllocationsByPeriods(caterer._id, periodIds),
    populate ? diningQueries.findRebatesPopulated(filter, { lean: true, sort: { startDate: -1, _id: -1 } }) : diningQueries.findRebates(filter, { lean: true, sort: { startDate: -1, _id: -1 } }),
  ])
  const rosterByPeriod = new Map()
  const rebatesByPeriod = new Map()
  for (const allocation of allocations) {
    const id = idOf(allocation.periodId)
    if (!rosterByPeriod.has(id)) rosterByPeriod.set(id, new Set())
    rosterByPeriod.get(id).add(idOf(allocation.studentUserId))
  }
  for (const rebate of rebates) {
    const id = idOf(rebate.periodId)
    if (!rebatesByPeriod.has(id)) rebatesByPeriod.set(id, [])
    rebatesByPeriod.get(id).push(rebate)
  }
  return { periods, rosterByPeriod, rebatesByPeriod }
}

const uniqueStudents = (rebates) => [...new Map(rebates.map((rebate) => [idOf(rebate.studentUserId), rebate])).values()]
const calendarDay = (calendar, date) => {
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
  const allocatedCount = calendar.rosterByPeriod.get(periodId)?.size || 0
  return {
    counts: { date, periodId, allocatedCount, onRebateCount: onRebate.length, pendingCount: pending.length, expectedCount: Math.max(0, allocatedCount - onRebate.length) },
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
  const day = calendarDay(await loadCalendar(caterer, query.date, query.date, { populate: true }), query.date)
  const rebates = [...day.onRebate, ...day.pending, ...day.starting, ...day.returning]
  const profiles = await studentDetails(rebates.map((rebate) => rebate.studentUserId))
  const entry = (rebate) => {
    const profile = profiles.get(idOf(rebate.studentUserId))
    return { rebate: serializeRebate(rebate, profile), student: serializeStudent(profile, rebate) }
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
    periods = await diningQueries.findPeriods({ catererIds: caterer._id }, { lean: true, select: "_id" })
  }
  // Mongoose does not cast aggregation filters, so cast validated ids here.
  const filter = { catererId: caterer._id, periodId: { $in: periods.map((period) => new mongoose.Types.ObjectId(idOf(period))) } }
  if (query.from || query.to) {
    filter.dateKeys = { $elemMatch: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } }
  }
  const page = Number(query.page || 1)
  const limit = Number(query.limit || 20)
  const status = query.status || "all"
  const result = await diningQueries.findCatererRebatePage(filter, { search: query.search?.trim(), status, skip: (page - 1) * limit, limit })
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
    rebates: rebates.map((rebate) => serializeRebate(rebate, profiles.get(idOf(rebate.studentUserId)))),
    counts, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  })
}
