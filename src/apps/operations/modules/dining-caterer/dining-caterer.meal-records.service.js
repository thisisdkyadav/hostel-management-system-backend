import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { badRequest, success } from "../../../../services/base/index.js"
import { serializeVerification } from "../dining-meal-verification/dining-meal-verification.service.js"
import {
  idOf, dayKey, shiftDay, dayBounds, dayKeys, localDay, validateQuery, validateRange,
  getCatererScope, getPeriodScope, mealSlots, mealState, serializeCaterer,
  serializePeriod, studentDetails, serializeStudent,
} from "./dining-caterer.service.js"

export const getMealRecordOptions = async ({ user, query = {} }) => {
  const { caterer, error } = await getCatererScope(user, query)
  if (error) return error
  const now = new Date()
  const today = dayKey(now)
  const periods = await diningQueries.findPeriods({ catererIds: caterer._id }, { lean: true, sort: { startDate: -1, _id: -1 } })
  const current = periods.find((period) => !period.isArchived && dayKey(period.startDate) <= today && dayKey(period.endDate) >= today)
  const currentMeal = current && mealSlots(current).find((slot) => mealState(today, slot, now) === "serving")
  return success({
    caterer: serializeCaterer(caterer), today,
    currentPeriodId: current ? idOf(current) : null,
    currentMealSlotKey: currentMeal?.key || null,
    periods: periods.map((period) => ({
      ...serializePeriod(period), isArchived: Boolean(period.isArchived),
      isCurrent: idOf(period) === idOf(current), mealSlots: mealSlots(period),
    })),
  })
}

export const getMealRecordOverview = async ({ user, query }) => {
  const { caterer, period, error } = await getPeriodScope(user, query)
  if (error) return error
  const start = dayKey(period.startDate)
  const end = dayKey(period.endDate)
  const today = dayKey()
  const defaultTo = today < end ? today : end
  let to = query.to || defaultTo
  let from = query.from || shiftDay(to, -13)
  const rangeError = validateRange(from, to, 62)
  if (rangeError) return rangeError
  from = from < start ? start : from
  to = to > end ? end : to
  if (from > to) return badRequest("Date range must overlap the dining period")
  const keys = dayKeys(from, to)
  const slots = mealSlots(period)
  const [allocations, scans, rebates] = await Promise.all([
    allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id),
    diningQueries.findVerifications({
      catererId: caterer._id, periodId: period._id, status: "verified",
      scannedAt: { $gte: localDay(from), $lt: localDay(shiftDay(to, 1)) },
    }, { select: "studentUserId mealSlotKey scannedAt" }),
    diningQueries.findRebates({ catererId: caterer._id, periodId: period._id, status: "approved", dateKeys: { $in: keys } }, { lean: true }),
  ])
  const roster = new Set(allocations.map((row) => idOf(row.studentUserId)))
  const rebatedByDay = new Map(keys.map((key) => [key, new Set()]))
  for (const rebate of rebates) {
    if (!roster.has(idOf(rebate.studentUserId))) continue
    for (const key of rebate.dateKeys) rebatedByDay.get(key)?.add(idOf(rebate.studentUserId))
  }
  const verifiedByDayMeal = new Map()
  for (const scan of scans) {
    const key = `${dayKey(scan.scannedAt)}:${scan.mealSlotKey}`
    if (!verifiedByDayMeal.has(key)) verifiedByDayMeal.set(key, new Set())
    verifiedByDayMeal.get(key).add(idOf(scan.studentUserId))
  }
  return success({
    periodId: idOf(period), from, to, mealSlots: slots,
    days: keys.map((date) => ({
      date, allocatedCount: roster.size, onRebateCount: rebatedByDay.get(date).size,
      expectedCount: Math.max(0, roster.size - rebatedByDay.get(date).size),
      meals: Object.fromEntries(slots.map((slot) => [slot.key, { verifiedCount: verifiedByDayMeal.get(`${date}:${slot.key}`)?.size || 0 }])),
    })),
  })
}

export const getMealRecords = async ({ user, query }) => {
  const { caterer, period, error } = await getPeriodScope(user, query)
  if (error) return error
  const validation = validateQuery(query, { required: ["date", "mealSlotKey"] })
  if (validation) return validation
  const { date, mealSlotKey } = query
  if (date < dayKey(period.startDate) || date > dayKey(period.endDate)) return badRequest("date must be within the dining period")
  const slot = mealSlots(period).find((candidate) => candidate.key === mealSlotKey)
  if (!slot) return badRequest("mealSlotKey must exist in the dining period")
  const state = mealState(date, slot)
  const scanFilter = { catererId: caterer._id, periodId: period._id, mealSlotKey, scannedAt: dayBounds(date) }
  const [allocations, scans, rebates, issueScans] = await Promise.all([
    allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id),
    diningQueries.findVerifications(scanFilter, {
      select: "studentUserId status source scannedAt", sort: { scannedAt: 1, createdAt: 1, _id: 1 },
    }),
    diningQueries.findRebates({ catererId: caterer._id, periodId: period._id, status: "approved", dateKeys: date }, { lean: true, sort: { createdAt: 1, _id: 1 } }),
    diningQueries.findVerificationsPopulated({ ...scanFilter, status: { $ne: "verified" } }, {
      lean: true, sort: { scannedAt: -1, createdAt: -1, _id: -1 }, limit: 200,
    }),
  ])
  const profiles = await studentDetails(allocations.map((row) => row.studentUserId))
  const attempts = new Map()
  for (const scan of scans) {
    const id = idOf(scan.studentUserId)
    if (!attempts.has(id)) attempts.set(id, { count: 0, first: null })
    const entry = attempts.get(id)
    entry.count++
    if (scan.status === "verified" && !entry.first) entry.first = scan
  }
  const rebateByStudent = new Map()
  for (const rebate of rebates) {
    const id = idOf(rebate.studentUserId)
    if (!rebateByStudent.has(id)) rebateByStudent.set(id, rebate)
  }
  const students = allocations.map((allocation) => {
    const id = idOf(allocation.studentUserId)
    const attempt = attempts.get(id)
    const rebate = rebateByStudent.get(id)
    return {
      allocationId: idOf(allocation), student: serializeStudent(profiles.get(id), allocation),
      status: attempt?.first ? "verified" : rebate ? "on-rebate" : state === "ended" ? "missed" : "pending",
      verifiedAt: attempt?.first?.scannedAt || null, verificationSource: attempt?.first?.source || null,
      attemptCount: attempt?.count || 0,
      rebate: rebate ? { id: idOf(rebate), startDate: rebate.startDate, endDate: rebate.endDate, dayCount: rebate.dayCount, type: rebate.type } : null,
    }
  }).sort((a, b) => a.student.rollNumber.localeCompare(b.student.rollNumber))
  const onRebateCount = students.filter((student) => student.rebate).length
  // Historical attendance survives allocation changes, as in the overview.
  // Roster statuses and expected/missed/pending counts use current allocations.
  const verified = [...attempts.values()].filter((attempt) => attempt.first)
  const issues = issueScans.map(serializeVerification)
  return success({
    caterer: serializeCaterer(caterer), period: serializePeriod(period), date, mealSlot: slot, mealState: state,
    summary: {
      allocatedCount: students.length, onRebateCount, expectedCount: Math.max(0, students.length - onRebateCount),
      verifiedCount: verified.length,
      missedCount: students.filter((student) => student.status === "missed").length,
      pendingCount: students.filter((student) => student.status === "pending").length,
      manualCount: verified.filter((attempt) => attempt.first.source === "manual").length,
      faceCount: verified.filter((attempt) => attempt.first.source === "face-scanner").length,
      issueCount: issues.length,
    }, students, issues,
  })
}
