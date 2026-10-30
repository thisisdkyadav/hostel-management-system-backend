/**
 * Dining Allocations
 * The student roster of one dining period: who is allocated to which caterer,
 * with photo and room, and per-student meals, rebates and billable days.
 * Caterer logins see their own kitchen and billable days only; Admin and the
 * Dining Office see every caterer (or one, with ?catererId) plus mess-fee status.
 * Read-only: allocation writes stay on /admin/dining-periods/:id/allocations.
 */

import mongoose from "mongoose"
import { success, badRequest } from "../../../../services/base/index.js"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { billingQueries } from "../../../../services/dining/billingQueries.service.js"
import { getDayKey, listDayKeys, normalizeDay } from "../../../../services/dining/dining-rebate.service.js"
import { resolveMealSlotsForDay } from "../../../../services/dining/mealSchedule.js"
import { periodDay } from "../../../../services/dining/periodDay.js"
import { loadTagContext } from "../../../../services/dining/tagResolve.js"
import { loadBillingPeriodAccounts } from "../../../administration/modules/admin/dining-billing.service.js"
import { dayKey, getDiningScope, getPeriodScope, idOf, mealSlots, serializeCaterer, serializeStudent, studentDetails } from "../dining-caterer/dining-caterer.service.js"

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : null)

const runtimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const TIMEZONE = runtimeZone === "Asia/Calcutta" ? "Asia/Kolkata" : runtimeZone

// Calendar facts use the billing engine's day keys, so billed days here match
// Billing Cycles; "today" is the local calendar day (see periodDay.js).
const periodCalendar = (period, today = periodDay()) => {
  const start = normalizeDay(period.startDate)
  const end = normalizeDay(period.endDate)
  const allKeys = start && end ? listDayKeys(start, end) : []
  const elapsedEnd = end < today ? end : today
  const elapsedKeys = start && elapsedEnd >= start ? listDayKeys(start, elapsedEnd) : []
  const phase = today < start ? "upcoming" : today > end ? "past" : "current"
  return { allKeys, elapsedKeys, phase }
}

// Run report of the scheduled auto-allocation; per-caterer breakdown and error
// text are for oversight (Admin / Dining Office) only.
const serializeAutoAllocation = (run, oversight) => {
  if (!run?.status) return null
  return {
    status: run.status,
    completedAt: run.completedAt || null,
    assigned: Number(run.assigned || 0),
    leftOver: Number(run.leftOver || 0),
    unallocatedBefore: Number(run.unallocatedBefore || 0),
    ...(oversight
      ? {
          byCaterer: (run.byCaterer || []).map((entry) => ({ catererId: idOf(entry.catererId), assigned: Number(entry.assigned || 0) })),
          error: run.error || null,
        }
      : {}),
  }
}

const serializeWindow = (period, oversight = false) => ({
  registrationEnabled: period.registrationEnabled !== false,
  allocationStartAt: period.allocationStartAt || null,
  allocationEndAt: period.allocationEndAt || null,
  autoAllocationAt: period.autoAllocationAt || null,
  autoAllocation: serializeAutoAllocation(period.autoAllocation, oversight),
})

/** Seats per caterer in scope, from the period's capacities and true allocation counts. */
const catererSeats = (period, counts, names, caterer) => {
  const capacities = new Map((period.catererCapacities || []).map((entry) => [idOf(entry.catererId), Number(entry.maxStudentCount || 0)]))
  return (period.catererIds || [])
    .map(idOf)
    .filter((id) => !caterer || id === idOf(caterer))
    .map((id) => ({ id, name: names.get(id) || "Caterer", allocated: counts.get(id) || 0, capacity: capacities.get(id) || 0 }))
}

const sumSeats = (seats) => seats.reduce((acc, seat) => ({ allocated: acc.allocated + seat.allocated, capacity: acc.capacity + seat.capacity }), { allocated: 0, capacity: 0 })

// Current first, then upcoming soonest-first, then the most recent past period.
const pickDefaultPeriod = (periods) =>
  periods.find((period) => period.phase === "current" && !period.isArchived) ||
  [...periods].reverse().find((period) => period.phase === "upcoming" && !period.isArchived) ||
  periods.find((period) => !period.isArchived) ||
  periods[0] ||
  null

export const getAllocationPeriods = async ({ user, query = {} }) => {
  const { caterer, oversight, error } = await getDiningScope(user, query)
  if (error) return error

  const [periods, caterers] = await Promise.all([
    diningQueries.findPeriods(caterer ? { catererIds: caterer._id } : {}, { lean: true, sort: { startDate: -1, _id: -1 } }),
    diningQueries.findCaterers({}, { select: "name email isArchived", lean: true, sort: { name: 1 } }),
  ])
  const names = new Map(caterers.map((item) => [idOf(item), item.name]))
  const counts = periods.length ? await allocationQueries.countAllocationsByPeriodsAndCaterer(periods.map((period) => period._id)) : []
  const countsByPeriod = new Map()
  counts.forEach(({ _id, count }) => {
    const key = idOf(_id.periodId)
    if (!countsByPeriod.has(key)) countsByPeriod.set(key, new Map())
    countsByPeriod.get(key).set(idOf(_id.catererId), count)
  })

  const today = periodDay()
  const items = periods.map((period) => {
    const { allKeys, elapsedKeys, phase } = periodCalendar(period, today)
    const seats = catererSeats(period, countsByPeriod.get(idOf(period)) || new Map(), names, caterer)
    return {
      id: idOf(period),
      startDate: dayKey(period.startDate),
      endDate: dayKey(period.endDate),
      phase,
      isArchived: Boolean(period.isArchived),
      totalDays: allKeys.length,
      elapsedDays: elapsedKeys.length,
      dailyRate: Math.max(0, Number(period.dailyRate || 0)),
      ...serializeWindow(period, oversight),
      ...sumSeats(seats),
      ...(oversight ? { eligible: Number(period.eligibleStudentCount || 0) } : {}),
      caterers: seats,
    }
  })

  return success({
    today: dayKey(),
    caterer: caterer ? serializeCaterer(caterer) : null,
    ...(oversight ? { caterers: caterers.map((item) => ({ ...serializeCaterer(item), isArchived: Boolean(item.isArchived) })) } : {}),
    defaultPeriodId: pickDefaultPeriod(items)?.id || null,
    periods: items,
  })
}

const emptyRebates = () => ({ approvedDays: 0, elapsedDays: 0, pending: 0, rejected: 0, keys: new Set() })

export const getAllocationRoster = async ({ user, query = {} }) => {
  const { caterer, oversight, period, error } = await getPeriodScope(user, query)
  if (error) return error

  const today = periodDay()
  const todayKey = dayKey()
  const { allKeys, elapsedKeys, phase } = periodCalendar(period, today)
  const elapsedSet = new Set(elapsedKeys)
  const dailyRate = Math.max(0, Number(period.dailyRate || 0))

  const [allocations, caterers, feePeriods] = await Promise.all([
    caterer
      ? allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id)
      : allocationQueries.findAllocationsByPeriod(period._id),
    diningQueries.findCaterers({ _id: { $in: period.catererIds || [] } }, { select: "name email", lean: true }),
    oversight ? billingQueries.findBillingPeriodsByDiningPeriods([period._id]) : [],
  ])
  const userIds = allocations.map((row) => idOf(row.studentUserId))
  const allocatedUsers = new Set(userIds)
  const activeFee = feePeriods.find((fee) => !fee.isArchived) || feePeriods[0] || null

  const [profiles, meals, rebates, feeAccounts, tagContext] = await Promise.all([
    studentDetails(userIds),
    phase === "upcoming" || !userIds.length ? [] : diningQueries.aggregateCycleMeals(period._id, TIMEZONE),
    userIds.length
      ? diningQueries.findRebates({ periodId: period._id, studentUserId: { $in: allocations.map((row) => row.studentUserId) } }, { select: "studentUserId status dateKeys", lean: true })
      : [],
    activeFee ? loadBillingPeriodAccounts(activeFee) : null,
    // Allocation tags of this period + standalone tags overlapping its days.
    loadTagContext({ periods: [period], fromKey: getDayKey(period.startDate), toKey: getDayKey(period.endDate), studentUserIds: userIds }),
  ])

  const slots = mealSlots(period)
  const offeredByDay = new Map(elapsedKeys.map((key) => [key, resolveMealSlotsForDay(period, key).length]))

  const mealsByUser = new Map()
  meals.forEach(({ studentUserId, date, mealSlotKey }) => {
    const key = idOf(studentUserId)
    if (!allocatedUsers.has(key)) return
    if (!mealsByUser.has(key)) mealsByUser.set(key, { total: 0, bySlot: {}, days: new Set(), last: "" })
    const entry = mealsByUser.get(key)
    entry.total += 1
    entry.bySlot[mealSlotKey] = (entry.bySlot[mealSlotKey] || 0) + 1
    entry.days.add(date)
    if (date > entry.last) entry.last = date
  })

  const rebatesByUser = new Map()
  rebates.forEach((rebate) => {
    const key = idOf(rebate.studentUserId)
    if (!rebatesByUser.has(key)) rebatesByUser.set(key, emptyRebates())
    const entry = rebatesByUser.get(key)
    if (rebate.status === "pending") entry.pending += 1
    if (rebate.status === "rejected") entry.rejected += 1
    if (rebate.status !== "approved") return
    ;(rebate.dateKeys || []).forEach((dateKey) => {
      entry.approvedDays += 1
      entry.keys.add(dateKey)
      if (elapsedSet.has(dateKey)) entry.elapsedDays += 1
    })
  })

  const feeByUser = new Map((feeAccounts?.accounts || []).map((account) => [idOf(account.studentUserId), account]))
  const catererNames = new Map(caterers.map((item) => [idOf(item), item.name]))

  const students = allocations.map((allocation) => {
    const key = idOf(allocation.studentUserId)
    const meal = mealsByUser.get(key)
    const rebate = rebatesByUser.get(key) || emptyRebates()
    // Meals offered on the student's non-rebate elapsed days.
    const offered = elapsedKeys.reduce((sum, dateKey) => (rebate.keys.has(dateKey) ? sum : sum + offeredByDay.get(dateKey)), 0)
    const chargeableDays = Math.max(0, elapsedKeys.length - rebate.elapsedDays)
    const fee = feeByUser.get(key)
    return {
      ...serializeStudent(profiles.get(key), allocation),
      caterer: { id: idOf(allocation.catererId), name: catererNames.get(idOf(allocation.catererId)) || "Caterer" },
      selectedAt: allocation.selectedAt || allocation.createdAt || null,
      meals: meal?.total || 0,
      mealsBySlot: meal?.bySlot || {},
      daysEaten: meal?.days.size || 0,
      lastMealDate: meal?.last || null,
      ateToday: Boolean(meal?.days.has(todayKey)),
      mealsOffered: offered,
      attendance: pct(meal?.total || 0, offered),
      onRebateToday: phase === "current" && rebate.keys.has(todayKey),
      rebateDays: rebate.elapsedDays,
      approvedRebateDays: rebate.approvedDays,
      pendingRebates: rebate.pending,
      chargeableDays,
      billed: round2(chargeableDays * dailyRate),
      tags: tagContext.studentTagMap(key),
      ...(oversight
        ? { fee: fee ? { paid: fee.allocatedAmount, charged: fee.totalCharged, balance: fee.balance, clearance: fee.clearance } : null }
        : {}),
    }
  }).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))

  const counts = students.reduce((map, student) => map.set(student.caterer.id, (map.get(student.caterer.id) || 0) + 1), new Map())
  const seats = catererSeats(period, counts, catererNames, caterer)
  const totals = students.reduce(
    (acc, student) => {
      acc.meals += student.meals
      acc.rebateDays += student.rebateDays
      acc.billedDays += student.chargeableDays
      acc.billedAmount += student.billed
      acc.pendingRebates += student.pendingRebates
      if (student.ateToday) acc.ateToday += 1
      if (student.onRebateToday) acc.onRebateToday += 1
      if (!student.meals && student.chargeableDays > 0) acc.neverAte += 1
      return acc
    },
    { meals: 0, rebateDays: 0, billedDays: 0, billedAmount: 0, pendingRebates: 0, ateToday: 0, onRebateToday: 0, neverAte: 0 }
  )
  const mealsOffered = students.reduce((sum, student) => sum + student.mealsOffered, 0)
  const approvedFutureDays = students.reduce((sum, student) => sum + (student.approvedRebateDays - student.rebateDays), 0)
  const projectedDays = Math.max(0, totals.billedDays + students.length * (allKeys.length - elapsedKeys.length) - approvedFutureDays)

  let fee = null
  if (oversight && activeFee) {
    const withFee = students.filter((student) => student.fee)
    const dues = withFee.filter((student) => student.fee.clearance === "dues")
    fee = {
      id: idOf(activeFee),
      name: activeFee.name,
      withFee: withFee.length,
      paid: round2(withFee.reduce((sum, student) => sum + Number(student.fee.paid || 0), 0)),
      dues: dues.length,
      duesAmount: round2(dues.reduce((sum, student) => sum + Math.abs(Number(student.fee.balance || 0)), 0)),
    }
  }

  return success({
    period: {
      id: idOf(period),
      startDate: dayKey(period.startDate),
      endDate: dayKey(period.endDate),
      phase,
      isArchived: Boolean(period.isArchived),
      totalDays: allKeys.length,
      elapsedDays: elapsedKeys.length,
      dailyRate,
      ...serializeWindow(period, oversight),
      ...(oversight ? { eligible: Number(period.eligibleStudentCount || 0) } : {}),
    },
    today: todayKey,
    scope: { oversight: Boolean(oversight), caterer: caterer ? serializeCaterer(caterer) : null },
    mealSlots: slots,
    tags: tagContext.tags.map(({ from, to, ...summary }) => summary),
    caterers: seats,
    summary: {
      ...sumSeats(seats),
      ...(oversight ? { notChosen: Math.max(0, Number(period.eligibleStudentCount || 0) - students.length) } : {}),
      ateToday: totals.ateToday,
      onRebateToday: totals.onRebateToday,
      neverAte: totals.neverAte,
      meals: totals.meals,
      attendance: pct(totals.meals, mealsOffered),
      rebateDays: totals.rebateDays,
      pendingRebates: totals.pendingRebates,
      billedDays: totals.billedDays,
      billedAmount: round2(totals.billedAmount),
      projectedAmount: round2(projectedDays * dailyRate),
      fee,
    },
    students,
  })
}

/** Every period a student was allocated in (one caterer's, for a caterer login), newest first. */
export const getStudentAllocationHistory = async ({ user, query = {} }) => {
  const { studentUserId } = query
  if (typeof studentUserId !== "string" || !mongoose.Types.ObjectId.isValid(studentUserId)) {
    return badRequest("studentUserId must be a valid ObjectId")
  }
  const { caterer, error } = await getDiningScope(user, { catererId: query.catererId })
  if (error) return error

  const rows = await allocationQueries.findAllocationHistoryByUser(studentUserId, { catererId: caterer?._id })
  if (!rows.length) return success({ history: [] })
  const periods = await diningQueries.findPeriods({ _id: { $in: rows.map((row) => row.periodId) } }, { select: "startDate endDate isArchived", lean: true })
  const periodById = new Map(periods.map((period) => [idOf(period), period]))
  const today = periodDay()
  const history = rows
    .filter((row) => periodById.has(idOf(row.periodId)))
    .map((row) => {
      const period = periodById.get(idOf(row.periodId))
      return {
        periodId: idOf(period),
        startDate: dayKey(period.startDate),
        endDate: dayKey(period.endDate),
        phase: periodCalendar(period, today).phase,
        isArchived: Boolean(period.isArchived),
        caterer: { id: idOf(row.catererId), name: row.catererId?.name || "Caterer" },
        selectedAt: row.selectedAt || null,
      }
    })
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
  return success({ history })
}

export default { getAllocationPeriods, getAllocationRoster, getStudentAllocationHistory }
