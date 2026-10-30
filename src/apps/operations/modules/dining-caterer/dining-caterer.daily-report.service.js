import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { badRequest, success } from "../../../../services/base/index.js"
import {
  idOf, dayKey, shiftDay, dayBounds, dayKeys, localDay, getDiningScope, catererMatch,
  mealSlots, mealState, serializeCaterer, serializePeriod, studentDetails, serializeStudent,
} from "./dining-caterer.service.js"
import { loadTagContext } from "../../../../services/dining/tagResolve.js"

export const CHECK_ON_DAYS = [2, 3, 5, 7, 14]
const DEFAULT_CHECK_ON_DAYS = 3

const blankCounts = (slots) => ({
  allocatedCount: 0, onRebateCount: 0, expectedCount: 0, ateAnyCount: 0, ateNothingCount: 0, issueCount: 0,
  meals: Object.fromEntries(slots.map((slot) => [slot.key, { verifiedCount: 0, notEatenCount: 0 }])),
})

/** Every period serving `date` (active ones first), optionally only those this caterer serves. */
const periodsOn = (date, caterer) => diningQueries.findPeriods({
  startDate: { $lt: localDay(shiftDay(date, 1)) }, endDate: { $gte: localDay(date) },
  ...(caterer ? { catererIds: caterer._id } : {}),
}, { lean: true, sort: { isArchived: 1, startDate: -1, _id: -1 } })

/**
 * One day across every caterer (Admin and the Dining Office): for each caterer,
 * who was assigned, away on rebate, and expected, and for each meal how many ate
 * and how many did not. Plus "students to check on": assigned, not on rebate,
 * yet no meal anywhere for the last N full days (left campus without a rebate,
 * unwell, or the scanner is not recognising them).
 */
export const getDailyReport = async ({ user, query = {} }) => {
  const scope = await getDiningScope(user, query)
  if (scope.error) return scope.error
  const { caterer } = scope
  const days = query.days === undefined ? DEFAULT_CHECK_ON_DAYS : Number(query.days)
  if (!CHECK_ON_DAYS.includes(days)) return badRequest(`days must be one of: ${CHECK_ON_DAYS.join(", ")}`)
  const today = dayKey()
  const date = query.date || today

  // Periods can overlap (nothing forbids it): list them all, report on the one asked for or the first.
  const running = await periodsOn(date, caterer)
  const period = running.find((item) => idOf(item) === query.periodId) || running[0] || null
  const head = {
    date, today, days, caterer: caterer ? serializeCaterer(caterer) : null,
    periods: running.map((item) => ({ ...serializePeriod(item), isArchived: Boolean(item.isArchived) })),
  }
  if (!period) return success({ ...head, period: null, mealSlots: [], caterers: [], totals: null, checkOn: null })

  const slots = mealSlots(period, date).map((slot) => ({ ...slot, state: mealState(date, slot) }))
  const allEnded = slots.length > 0 && slots.every((slot) => slot.state === "ended")
  const periodStart = dayKey(period.startDate)

  // "Check on" looks at full days only: up to the chosen day, or yesterday if that is today.
  const windowTo = date < today ? date : shiftDay(today, -1)
  const windowFrom = shiftDay(windowTo, -(days - 1))
  const checkWindow = windowFrom >= periodStart && windowTo <= dayKey(period.endDate)
  const windowKeys = checkWindow ? dayKeys(windowFrom, windowTo) : []

  const [allocations, dayScans, rebates, catererDocs, ateInWindow] = await Promise.all([
    caterer
      ? allocationQueries.findAllocationsByPeriodAndCaterer(period._id, caterer._id)
      : allocationQueries.findAllocationsByPeriod(period._id),
    diningQueries.findVerifications(
      { ...catererMatch(caterer), periodId: period._id, scannedAt: dayBounds(date) },
      { select: "studentUserId catererId mealSlotKey status" },
    ),
    diningQueries.findRebates(
      { ...catererMatch(caterer), periodId: period._id, status: "approved", dateKeys: { $in: [date, ...windowKeys] } },
      { lean: true, select: "studentUserId dateKeys" },
    ),
    diningQueries.findCaterers({ _id: { $in: caterer ? [caterer._id] : period.catererIds } }, { lean: true, sort: { name: 1 } }),
    // A meal at any caterer counts: the student is eating, just somewhere else.
    checkWindow
      ? diningQueries.distinctVerifiedStudents({ scannedAt: { $gte: localDay(windowFrom), $lt: localDay(shiftDay(windowTo, 1)) } })
      : [],
  ])

  const tagContext = await loadTagContext({
    periods: [period], fromKey: date, toKey: date, studentUserIds: allocations.map((row) => row.studentUserId),
  })
  // Expected eaters with each tag that applies on `date` (every applicable tag, count may be 0).
  const tagCountsOf = (userIds) => tagContext.tagCountsOn(date, { periodId: period._id, userIds })

  const awayToday = new Set()
  const awayInWindow = new Set()
  const windowSet = new Set(windowKeys)
  for (const rebate of rebates) {
    const id = idOf(rebate.studentUserId)
    if (rebate.dateKeys.includes(date)) awayToday.add(id)
    if (rebate.dateKeys.some((key) => windowSet.has(key))) awayInWindow.add(id)
  }

  // Unique students per caterer and meal, counted where they were scanned.
  const ate = new Map()
  const ateAny = new Set()
  const issues = new Map()
  for (const scan of dayScans) {
    const where = idOf(scan.catererId)
    if (scan.status !== "verified") {
      issues.set(where, (issues.get(where) || 0) + 1)
      continue
    }
    const key = `${where}:${scan.mealSlotKey}`
    if (!ate.has(key)) ate.set(key, new Set())
    ate.get(key).add(idOf(scan.studentUserId))
    ateAny.add(idOf(scan.studentUserId))
  }

  const rows = catererDocs.map((doc) => {
    const id = idOf(doc)
    const roster = allocations.filter((row) => idOf(row.catererId) === id).map((row) => idOf(row.studentUserId))
    const away = roster.filter((studentId) => awayToday.has(studentId)).length
    const expected = Math.max(0, roster.length - away)
    const expectedIds = roster.filter((studentId) => !awayToday.has(studentId))
    const ateAnyCount = expectedIds.filter((studentId) => ateAny.has(studentId)).length
    return {
      id, name: doc.name, isArchived: Boolean(doc.isArchived),
      allocatedCount: roster.length, onRebateCount: away, expectedCount: expected,
      ateAnyCount, ateNothingCount: allEnded ? expected - ateAnyCount : null,
      issueCount: issues.get(id) || 0,
      tagCounts: tagCountsOf(expectedIds),
      meals: Object.fromEntries(slots.map((slot) => {
        const verifiedCount = ate.get(`${id}:${slot.key}`)?.size || 0
        return [slot.key, { verifiedCount, notEatenCount: slot.state === "upcoming" ? null : Math.max(0, expected - verifiedCount) }]
      })),
    }
  })

  const totals = blankCounts(slots)
  const expectedRows = allocations.filter((row) => rows.some((item) => item.id === idOf(row.catererId)))
  totals.tagCounts = tagCountsOf(expectedRows.map((row) => idOf(row.studentUserId)).filter((studentId) => !awayToday.has(studentId)))
  for (const row of rows) {
    for (const key of ["allocatedCount", "onRebateCount", "expectedCount", "ateAnyCount", "issueCount"]) totals[key] += row[key]
    totals.ateNothingCount = allEnded ? totals.ateNothingCount + row.ateNothingCount : null
    for (const slot of slots) {
      totals.meals[slot.key].verifiedCount += row.meals[slot.key].verifiedCount
      const notEaten = row.meals[slot.key].notEatenCount
      totals.meals[slot.key].notEatenCount = notEaten === null ? null : totals.meals[slot.key].notEatenCount + notEaten
    }
  }

  // Students to check on: on the roster before the window began, no rebate in it, no meal in it.
  let checkOn = { from: windowFrom, to: windowTo, available: checkWindow, students: [] }
  if (checkWindow) {
    const eaten = new Set(ateInWindow.map(idOf))
    const windowStart = localDay(windowFrom)
    const flagged = allocations.filter((row) => {
      const id = idOf(row.studentUserId)
      const joined = row.createdAt ? new Date(row.createdAt) : null
      return !eaten.has(id) && !awayInWindow.has(id) && (!joined || joined < windowStart)
    })
    const [profiles, lastMeals] = await Promise.all([
      studentDetails(flagged.map((row) => row.studentUserId)),
      diningQueries.aggregateLastVerifiedByRollNumbers(flagged.map((row) => row.rollNumber), windowStart),
    ])
    const lastByRoll = new Map(lastMeals.map((item) => [item._id, item]))
    const catererById = new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }]))
    const dayMs = 86400000
    checkOn.students = flagged.map((row) => {
      const last = lastByRoll.get(row.rollNumber)
      // Days with no meal, counted from the day after the last one (or from when they joined this period).
      const since = last ? shiftDay(dayKey(last.scannedAt), 1) : [periodStart, row.createdAt ? dayKey(row.createdAt) : periodStart].sort().pop()
      return {
        student: serializeStudent(profiles.get(idOf(row.studentUserId)), row),
        caterer: catererById.get(idOf(row.catererId)) || null,
        lastMealAt: last?.scannedAt || null,
        lastMealName: last?.mealSlotName || null,
        daysWithoutMeal: Math.max(days, Math.round((localDay(shiftDay(windowTo, 1)) - localDay(since)) / dayMs)),
      }
    }).sort((a, b) => b.daysWithoutMeal - a.daysWithoutMeal || a.student.rollNumber.localeCompare(b.student.rollNumber))
  }

  return success({ ...head, period: serializePeriod(period), mealSlots: slots, caterers: rows, totals, checkOn })
}
