import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { badRequest, success } from "../../../../services/base/index.js"
import { serializeVerification } from "../dining-meal-verification/dining-meal-verification.service.js"
import { loadScanTags, loadTagContext } from "../../../../services/dining/tagResolve.js"
import { rebateEligibleAllocations, rebateScopeFilter } from "../../../../services/dining/rebateScope.js"
import {
  idOf, dayKey, shiftDay, dayBounds, dayKeys, localDay, validateQuery, validateRange,
  getDiningScope, getPeriodScope, catererMatch, mealSlots, mealState, serializeCaterer,
  serializePeriod, studentDetails, serializeStudent,
} from "./dining-caterer.service.js"

const rosterFor = (period, caterer) => (caterer
  ? allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id)
  : allocationQueries.findAllocationsByPeriod(period._id))

/** Approved rebates of these allocated students touching [fromKey, toKey] (days inside their period; unregistered rows count none). */
const findRosterRebates = (allocations, fromKey, toKey, { sort } = {}) => {
  const filter = rebateScopeFilter([{ studentUserIds: rebateEligibleAllocations(allocations).map((row) => row.studentUserId), fromKey, toKey }], { status: "approved" })
  return filter ? diningQueries.findRebates(filter, { lean: true, ...(sort ? { sort } : {}) }) : []
}

export const getMealRecordOptions = async ({ user, query = {} }) => {
  const { caterer, oversight, error } = await getDiningScope(user, query)
  if (error) return error
  const now = new Date()
  const today = dayKey(now)
  const [periods, caterers] = await Promise.all([
    diningQueries.findPeriods(caterer ? { catererIds: caterer._id } : {}, { lean: true, sort: { startDate: -1, _id: -1 } }),
    oversight ? diningQueries.findCaterers({}, { lean: true, sort: { name: 1 } }) : null,
  ])
  const current = periods.find((period) => !period.isArchived && dayKey(period.startDate) <= today && dayKey(period.endDate) >= today)
  const currentMeal = current && mealSlots(current, today).find((slot) => mealState(today, slot, now) === "serving")
  return success({
    caterer: caterer ? serializeCaterer(caterer) : null, today,
    currentPeriodId: current ? idOf(current) : null,
    currentMealSlotKey: currentMeal?.key || null,
    ...(oversight ? { caterers: caterers.map((item) => ({ ...serializeCaterer(item), isArchived: Boolean(item.isArchived) })) } : {}),
    periods: periods.map((period) => ({
      ...serializePeriod(period), isArchived: Boolean(period.isArchived),
      isCurrent: idOf(period) === idOf(current), mealSlots: mealSlots(period),
      ...(oversight ? { catererIds: (period.catererIds || []).map(idOf) } : {}),
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
  const [allocations, scans] = await Promise.all([
    rosterFor(period, caterer),
    diningQueries.findVerifications({
      ...catererMatch(caterer), periodId: period._id, status: "verified",
      scannedAt: { $gte: localDay(from), $lt: localDay(shiftDay(to, 1)) },
    }, { select: "studentUserId mealSlotKey scannedAt" }),
  ])
  // Rebates count for the roster's students on the range's days (already inside the period).
  const rebates = await findRosterRebates(allocations, from, to)
  const roster = new Set(allocations.map((row) => idOf(row.studentUserId)))
  const tagContext = await loadTagContext({ periods: [period], fromKey: from, toKey: to, studentUserIds: [...roster] })
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
      tagCounts: tagContext.tagCountsOn(date, { periodId: period._id, userIds: [...roster].filter((id) => !rebatedByDay.get(date).has(id)) }),
      meals: Object.fromEntries(slots.map((slot) => [slot.key, { verifiedCount: verifiedByDayMeal.get(`${date}:${slot.key}`)?.size || 0 }])),
    })),
  })
}

/**
 * One meal service. Caterers get their kitchen; admin and the dining office get
 * every caterer (or one, with ?catererId), plus a per-caterer breakdown and each
 * student's caterer. `light` skips the roster and the issue list: just the counts
 * and arrival times, for screens that poll often.
 */
const buildMealRecord = async ({ user, query }, { light = false } = {}) => {
  const { caterer, oversight, period, error } = await getPeriodScope(user, query)
  if (error) return error
  const validation = validateQuery(query, { required: ["date", "mealSlotKey"] })
  if (validation) return validation
  const { date, mealSlotKey } = query
  if (date < dayKey(period.startDate) || date > dayKey(period.endDate)) return badRequest("date must be within the dining period")
  const slot = mealSlots(period).find((candidate) => candidate.key === mealSlotKey)
  if (!slot) return badRequest("mealSlotKey must exist in the dining period")
  const state = mealState(date, slot)
  const scanFilter = { ...catererMatch(caterer), periodId: period._id, mealSlotKey, scannedAt: dayBounds(date) }
  const issueFilter = { ...scanFilter, status: { $ne: "verified" } }
  const [allocations, scans, issueScans, catererDocs] = await Promise.all([
    rosterFor(period, caterer),
    diningQueries.findVerifications(scanFilter, {
      select: "studentUserId catererId status source scannedAt", sort: { scannedAt: 1, createdAt: 1, _id: 1 },
    }),
    light
      ? diningQueries.findVerifications(issueFilter, { select: "catererId" })
      : diningQueries.findVerificationsPopulated(issueFilter, { lean: true, sort: { scannedAt: -1, createdAt: -1, _id: -1 }, limit: 200 }),
    oversight
      ? diningQueries.findCaterers({ _id: { $in: caterer ? [caterer._id] : period.catererIds } }, { lean: true, sort: { name: 1 } })
      : null,
  ])
  const rebates = await findRosterRebates(allocations, date, date, { sort: { createdAt: 1, _id: 1 } })
  const [profiles, tagContext] = light
    ? [new Map(), null]
    : await Promise.all([
      studentDetails(allocations.map((row) => row.studentUserId)),
      loadTagContext({ periods: [period], fromKey: date, toKey: date, studentUserIds: allocations.map((row) => row.studentUserId) }),
    ])
  // Expected eaters (allocated, not on rebate) with each tag that applies on `date`.
  const tagCountsOf = (list) => tagContext.tagCountsOn(date, {
    periodId: period._id, userIds: list.filter((row) => !row.rebate).map((row) => idOf(row.allocation.studentUserId)),
  })
  const catererById = new Map((catererDocs || []).map((item) => [idOf(item), { id: idOf(item), name: item.name }]))
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
  const statusOf = (attempt, rebate) => (attempt?.first ? "verified" : rebate ? "on-rebate" : state === "ended" ? "missed" : "pending")
  const rows = allocations.map((allocation) => {
    const id = idOf(allocation.studentUserId)
    return { allocation, attempt: attempts.get(id), rebate: rebateByStudent.get(id) }
  })
  const onRebateCount = rows.filter((row) => row.rebate).length
  // Historical attendance survives allocation changes, as in the overview.
  // Roster statuses and expected/missed/pending counts use current allocations.
  const verified = [...attempts.values()].filter((attempt) => attempt.first)
  const issueCount = issueScans.length
  const countOf = (status) => rows.filter((row) => statusOf(row.attempt, row.rebate) === status).length
  const summary = {
    allocatedCount: rows.length, onRebateCount, expectedCount: Math.max(0, rows.length - onRebateCount),
    verifiedCount: verified.length,
    missedCount: countOf("missed"),
    pendingCount: countOf("pending"),
    manualCount: verified.filter((attempt) => attempt.first.source === "manual").length,
    faceCount: verified.filter((attempt) => attempt.first.source === "face-scanner").length,
    issueCount,
    ...(tagContext ? { tagCounts: tagCountsOf(rows) } : {}),
  }

  // Every caterer in scope, busiest kitchen first; scans count where they were made.
  const caterers = oversight
    ? [...catererById.values()].map((item) => {
      const mine = rows.filter((row) => idOf(row.allocation.catererId) === item.id)
      const away = mine.filter((row) => row.rebate).length
      const ate = verified.filter((attempt) => idOf(attempt.first.catererId) === item.id)
      return {
        ...item, allocatedCount: mine.length, onRebateCount: away, expectedCount: Math.max(0, mine.length - away),
        verifiedCount: ate.length,
        missedCount: mine.filter((row) => statusOf(row.attempt, row.rebate) === "missed").length,
        pendingCount: mine.filter((row) => statusOf(row.attempt, row.rebate) === "pending").length,
        manualCount: ate.filter((attempt) => attempt.first.source === "manual").length,
        faceCount: ate.filter((attempt) => attempt.first.source === "face-scanner").length,
        issueCount: issueScans.filter((scan) => idOf(scan.catererId) === item.id).length,
        ...(tagContext ? { tagCounts: tagCountsOf(mine) } : {}),
      }
    }).sort((a, b) => b.expectedCount - a.expectedCount || a.name.localeCompare(b.name))
    : undefined

  const head = {
    caterer: caterer ? serializeCaterer(caterer) : null, period: serializePeriod(period), date, mealSlot: slot, mealState: state,
    summary, ...(caterers ? { caterers } : {}),
  }
  if (light) {
    const arrivals = verified.map(({ first }) => ({ studentId: idOf(first.studentUserId), catererId: idOf(first.catererId) || null, at: first.scannedAt }))
    return success({ ...head, arrivals })
  }
  const students = rows.map(({ allocation, attempt, rebate }) => {
    const id = idOf(allocation.studentUserId)
    return {
      allocationId: idOf(allocation),
      student: { ...serializeStudent(profiles.get(id), allocation), tags: tagContext.yesTagsOn(id, date, { periodId: period._id }), unregistered: Boolean(allocation.unregistered) },
      ...(oversight ? { caterer: catererById.get(idOf(allocation.catererId)) || null } : {}),
      status: statusOf(attempt, rebate),
      verifiedAt: attempt?.first?.scannedAt || null, verificationSource: attempt?.first?.source || null,
      attemptCount: attempt?.count || 0,
      rebate: rebate ? { id: idOf(rebate), startDate: rebate.startDate, endDate: rebate.endDate, dayCount: rebate.dayCount, type: rebate.type } : null,
    }
  }).sort((a, b) => a.student.rollNumber.localeCompare(b.student.rollNumber))
  return success({ ...head, students, issues: issueScans.map(serializeVerification) })
}

export const getMealRecords = (args) => buildMealRecord(args)

/** Counts only, for the live screen: no roster, no issue list. */
export const getMealPulse = (args) => buildMealRecord(args, { light: true })

/**
 * The latest scans of a day (optionally one meal, optionally one caterer), newest
 * first, each with the student's room and the caterer it was scanned at.
 */
export const getMealFeed = async ({ user, query = {} }) => {
  const { caterer, error } = await getDiningScope(user, query)
  if (error) return error
  const date = query.date || dayKey()
  const limit = Number(query.limit || 100)
  const filter = { ...catererMatch(caterer), scannedAt: dayBounds(date), ...(query.mealSlotKey ? { mealSlotKey: query.mealSlotKey } : {}) }
  const scans = await diningQueries.findVerificationsPopulated(filter, { lean: true, sort: { scannedAt: -1, createdAt: -1, _id: -1 }, limit })
  const [profiles, tagsOf] = await Promise.all([
    studentDetails(scans.map((scan) => scan.studentUserId).filter(Boolean)),
    loadScanTags(scans),
  ])
  return success({
    date,
    entries: scans.map((scan) => {
      const entry = serializeVerification(scan)
      const profile = scan.studentUserId ? profiles.get(idOf(scan.studentUserId)) : null
      const student = profile ? serializeStudent(profile, { rollNumber: scan.rollNumber }) : entry.student
      return student ? { ...entry, student: { ...student, tags: tagsOf(scan) } } : entry
    }),
  })
}
