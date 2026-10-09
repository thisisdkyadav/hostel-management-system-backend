import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { badRequest, success } from "../../../../services/base/index.js"
import { idOf, dayKey, localDay, shiftDay, dayKeys, mealSlots, mealState } from "../dining-caterer/dining-caterer.service.js"
import { calendarDay } from "../dining-caterer/dining-caterer.rebates.service.js"

const minutes = (time) => {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}
const addToSet = (map, key, value) => {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key).add(value)
}
const addCount = (map, key, count) => map.set(key, (map.get(key) || 0) + count)
// Current rosters can shrink below historical attendance. Keep counts intact,
// but rates satisfy the contract's 0..1 range.
const rate = (numerator, denominator) => denominator ? Math.min(1, numerator / denominator) : null
const percentile = (sorted, fraction) => {
  if (!sorted.length) return null
  // Linear interpolation (inclusive quantiles) of local clock minutes.
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower)
}
const mealsObject = (slots, counts, prefix) => Object.fromEntries(slots.map((slot) => [slot.key, { verified: counts.get(`${prefix}:${slot.key}`)?.size || 0 }]))

export const getDiningInsightsOverview = async ({ query = {} } = {}) => {
  if (query.days !== undefined && (typeof query.days !== "string" || !/^\d+$/.test(query.days) || !Number.isSafeInteger(Number(query.days)) || Number(query.days) < 7 || Number(query.days) > 90)) {
    return badRequest("days must be an integer between 7 and 90")
  }
  const days = Number(query.days ?? 30)
  const now = new Date()
  const today = dayKey(now)
  const from = shiftDay(today, 1 - days)
  const recentFrom = shiftDay(today, -13)
  const sevenFrom = shiftDay(today, -6)
  const scanFrom = from < recentFrom ? from : recentFrom
  const forecastTo = shiftDay(today, 13)
  // The shared dining helpers use Date#getHours/getFullYear (server-local).
  // Prefer the configured TZ; Intl resolves the server zone otherwise. Node's
  // ICU can spell Kolkata as Calcutta, which this MongoDB's tzdata rejects.
  // Preserve the zone's DST rules rather than using today's fixed UTC offset.
  const runtimeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
  const timezone = runtimeZone === "Asia/Calcutta" ? "Asia/Kolkata" : runtimeZone
  const dates = dayKeys(from, today)
  const forecastDates = dayKeys(today, forecastTo)
  const rebateDates = [...new Set([...dayKeys(scanFrom, today), ...forecastDates])]
  const [periods, caterers, firstScans, rebates] = await Promise.all([
    diningQueries.findPeriods({ isArchived: false, startDate: { $lt: localDay(shiftDay(forecastTo, 1)) }, endDate: { $gte: localDay(scanFrom) } }, { lean: true, sort: { startDate: -1, _id: -1 } }),
    diningQueries.findCaterers({ isArchived: false }, { lean: true, select: "name", sort: { name: 1, _id: 1 } }),
    diningQueries.aggregateDiningInsightFirstScans({ from: localDay(scanFrom), to: localDay(shiftDay(today, 1)), timezone }),
    // One rebate read covers both calendars; pending requests beyond the
    // forecast are also needed for the pendingRebates request-count tile.
    diningQueries.findRebates({ $or: [
      { status: "approved", dateKeys: { $in: rebateDates } },
      { status: "pending", dateKeys: { $elemMatch: { $gte: today } } },
    ] }, { lean: true, select: "periodId catererId studentUserId dateKeys status" }),
  ])
  const contains = (period, date) => dayKey(period.startDate) <= date && dayKey(period.endDate) >= date
  const currentPeriods = periods.filter((period) => contains(period, today))
  const windowPeriods = periods.filter((period) => dayKey(period.startDate) <= today && dayKey(period.endDate) >= from)
  const [allocations, scanSummary] = await Promise.all([
    allocationQueries.findAllocationRostersByPeriods(periods.map((period) => period._id)),
    diningQueries.aggregateDiningInsightAttempts({ from: localDay(from), to: localDay(shiftDay(today, 1)), timezone, currentPeriodIds: currentPeriods.map((period) => period._id) }),
  ])
  const rosters = new Map()
  for (const row of allocations) addToSet(rosters, `${idOf(row.periodId)}:${idOf(row.catererId)}`, idOf(row.studentUserId))
  const rebateByRosterDay = new Map()
  for (const rebate of rebates) {
    if (rebate.status !== "approved") continue
    const rosterKey = `${idOf(rebate.periodId)}:${idOf(rebate.catererId)}`
    const student = idOf(rebate.studentUserId)
    if (!rosters.get(rosterKey)?.has(student)) continue
    for (const date of rebate.dateKeys) addToSet(rebateByRosterDay, `${rosterKey}:${date}`, student)
  }
  const currentCatererIds = new Set(currentPeriods.flatMap((period) => period.catererIds.map(idOf)))
  const windowCatererIds = new Set(windowPeriods.flatMap((period) => period.catererIds.map(idOf)))
  const relevantCaterers = caterers.filter((caterer) => windowCatererIds.has(idOf(caterer)))
  const calendars = new Map(caterers.map((caterer) => {
    const id = idOf(caterer)
    const ownPeriods = periods.filter((period) => period.catererIds.some((value) => idOf(value) === id))
    const ownRebates = new Map()
    for (const rebate of rebates) {
      if (idOf(rebate.catererId) !== id) continue
      const periodId = idOf(rebate.periodId)
      if (!ownRebates.has(periodId)) ownRebates.set(periodId, [])
      ownRebates.get(periodId).push(rebate)
    }
    return [id, { periods: ownPeriods, rosterByPeriod: new Map(ownPeriods.map((period) => [idOf(period), rosters.get(`${idOf(period)}:${id}`) || new Set()])), rebatesByPeriod: ownRebates }]
  }))
  const dayScope = (id, date) => {
    // Same latest-start / _id tie-break as the caterer rebate calendar.
    const period = calendars.get(id).periods.find((candidate) => contains(candidate, date))
    const rosterKey = `${idOf(period)}:${id}`
    const roster = rosters.get(rosterKey) || new Set()
    const onRebate = rebateByRosterDay.get(`${rosterKey}:${date}`) || new Set()
    return { period, roster, onRebate, expected: Math.max(0, roster.size - onRebate.size) }
  }
  const slotMap = new Map()
  for (const period of windowPeriods) for (const slot of mealSlots(period)) if (!slotMap.has(slot.key)) slotMap.set(slot.key, slot)
  const slots = [...slotMap.values()].sort((a, b) => minutes(a.startTime) - minutes(b.startTime) || a.key.localeCompare(b.key))
  const verifiedByMeal = new Map()
  const verifiedByCatererMeal = new Map()
  const attended = new Set()
  const scannedRecent = new Set()
  const globalFirst = new Map()
  const rawByCaterer = new Map()
  const firstByCaterer = new Map()
  const faceByCaterer = new Map()
  const bySource = { manual: 0, "face-scanner": 0 }
  let verified = 0
  for (const scan of firstScans) {
    const { date, mealSlotKey, catererId, studentId } = scan._id
    const student = idOf(studentId)
    const caterer = idOf(catererId)
    attended.add(`${date}:${mealSlotKey}:${caterer}:${student}`)
    if (date >= sevenFrom) scannedRecent.add(student)
    if (date < from) continue
    addToSet(verifiedByMeal, `${date}:${mealSlotKey}`, student)
    addToSet(verifiedByCatererMeal, `${caterer}:${date}:${mealSlotKey}`, student)
    const key = `${date}:${mealSlotKey}:${student}`
    if (!globalFirst.has(key) || scan.scannedAt < globalFirst.get(key).scannedAt) globalFirst.set(key, scan)
    verified += scan.scans
    addCount(rawByCaterer, caterer, scan.scans)
    addCount(firstByCaterer, caterer, 1)
    if (scan.source === "face-scanner") addCount(faceByCaterer, caterer, 1)
    bySource[scan.source]++
  }
  const issues = {}
  const issuesByDay = new Map()
  const issuesByCaterer = new Map()
  for (const issue of scanSummary.issues) {
    issues[issue._id.status] = (issues[issue._id.status] || 0) + issue.count
    addCount(issuesByDay, issue._id.date, issue.count)
    addCount(issuesByCaterer, idOf(issue._id.catererId), issue.count)
  }
  const aggregateRoster = (date) => {
    const roster = new Set()
    const rebated = new Set()
    for (const caterer of relevantCaterers) {
      const scope = dayScope(idOf(caterer), date)
      for (const student of scope.roster) roster.add(student)
      for (const student of scope.onRebate) rebated.add(student)
    }
    return { allocated: roster.size, onRebate: rebated.size, expected: Math.max(0, roster.size - rebated.size) }
  }
  const daily = dates.map((date) => ({ date, ...aggregateRoster(date), meals: mealsObject(slots, verifiedByMeal, date), issues: issuesByDay.get(date) || 0 }))
  const peaks = slots.map((slot) => {
    const arrivals = [...globalFirst.values()].filter((scan) => scan._id.mealSlotKey === slot.key)
    const activeDays = new Set(arrivals.map((scan) => scan._id.date)).size
    const counts = new Map()
    for (const scan of arrivals) addCount(counts, Math.floor(scan.minute / 5) * 5, 1)
    const sorted = arrivals.map((scan) => scan.minute).sort((a, b) => a - b)
    // Overnight slots cover both ends of the calendar day; a contiguous
    // midnight-based histogram therefore spans the whole day.
    const overnight = minutes(slot.startTime) > minutes(slot.endTime)
    const start = overnight ? 0 : Math.max(0, Math.floor((minutes(slot.startTime) - 30) / 5) * 5)
    const end = overnight ? 1435 : Math.min(1435, Math.floor((minutes(slot.endTime) + 30) / 5) * 5)
    const buckets = []
    for (let minute = start; minute <= end; minute += 5) buckets.push({ minute, avgScans: activeDays ? (counts.get(minute) || 0) / activeDays : 0 })
    const peak = buckets.reduce((best, bucket) => !best || bucket.avgScans > best.avgScans ? bucket : best, null)
    return { mealSlotKey: slot.key, bucketMinutes: 5, buckets, peakMinute: peak?.avgScans > 0 ? peak.minute : null, p10Minute: percentile(sorted, 0.1), medianMinute: percentile(sorted, 0.5), p90Minute: percentile(sorted, 0.9), activeDays, avgDailyVerified: activeDays ? arrivals.length / activeDays : null }
  })
  const heat = new Map()
  const mealRates = new Map()
  const catererStats = new Map(relevantCaterers.map((caterer) => [idOf(caterer), { verified: 0, expected: 0, unused: 0, rebateSum: 0, rebateDays: 0 }]))
  for (const date of dates) {
    const dayMeals = new Map()
    for (const caterer of relevantCaterers) {
      const id = idOf(caterer)
      const scope = dayScope(id, date)
      const stats = catererStats.get(id)
      if (scope.roster.size) {
        stats.rebateSum += scope.onRebate.size / scope.roster.size
        stats.rebateDays++
      }
      for (const slot of mealSlots(scope.period || {})) {
        if (mealState(date, slot, now) !== "ended") continue
        const count = verifiedByCatererMeal.get(`${id}:${date}:${slot.key}`)?.size || 0
        stats.verified += count
        stats.expected += scope.expected
        if (date >= sevenFrom) stats.unused += scope.expected - count
        if (!dayMeals.has(slot.key)) dayMeals.set(slot.key, { roster: new Set(), rebate: new Set() })
        const cell = dayMeals.get(slot.key)
        for (const student of scope.roster) cell.roster.add(student)
        for (const student of scope.onRebate) cell.rebate.add(student)
      }
    }
    for (const [key, cell] of dayMeals) {
      const expected = Math.max(0, cell.roster.size - cell.rebate.size)
      const count = verifiedByMeal.get(`${date}:${key}`)?.size || 0
      const heatKey = `${localDay(date).getDay()}:${key}`
      if (!heat.has(heatKey)) heat.set(heatKey, { verified: 0, expected: 0, samples: 0 })
      const entry = heat.get(heatKey)
      entry.verified += count
      entry.expected += expected
      entry.samples++
      if (!mealRates.has(key)) mealRates.set(key, { verified: 0, expected: 0 })
      mealRates.get(key).verified += count
      mealRates.get(key).expected += expected
    }
  }
  const weekdayHeat = Array.from({ length: 7 }, (_, weekday) => slots.map((slot) => {
    const cell = heat.get(`${weekday}:${slot.key}`)
    return { weekday, mealSlotKey: slot.key, attendanceRate: rate(cell?.verified || 0, cell?.expected || 0), samples: cell?.samples || 0 }
  })).flat()
  const catererRows = relevantCaterers.map((caterer) => {
    const id = idOf(caterer)
    const scope = dayScope(id, today)
    const stats = catererStats.get(id)
    const issueCount = issuesByCaterer.get(id) || 0
    return { id, name: caterer.name, allocated: scope.roster.size, todayOnRebate: scope.onRebate.size, todayExpected: scope.expected, today: mealsObject(slots, verifiedByCatererMeal, `${id}:${today}`), attendanceRate: rate(stats.verified, stats.expected), rebateShare: rate(stats.rebateSum, stats.rebateDays), issueRate: rate(issueCount, issueCount + (rawByCaterer.get(id) || 0)), faceShare: rate(faceByCaterer.get(id) || 0, firstByCaterer.get(id) || 0), unusedPlates7d: Math.max(0, stats.unused) }
  })
  const rebateForecast = forecastDates.map((date) => {
    const sets = { onRebate: new Set(), pending: new Set(), starting: new Set(), returning: new Set() }
    for (const calendar of calendars.values()) {
      const entry = calendarDay(calendar, date)
      for (const key of Object.keys(sets)) for (const rebate of entry[key]) sets[key].add(idOf(rebate.studentUserId))
    }
    return { date, ...Object.fromEntries(Object.entries(sets).map(([key, students]) => [key, students.size])) }
  })
  const allocatedStudents = new Set()
  const todayRebated = new Set()
  for (const row of allocations) if (currentPeriods.some((period) => idOf(period) === idOf(row.periodId)) && currentCatererIds.has(idOf(row.catererId))) allocatedStudents.add(idOf(row.studentUserId))
  for (const caterer of relevantCaterers) for (const student of dayScope(idOf(caterer), today).onRebate) todayRebated.add(student)
  const studentExpected = new Map()
  const studentAttended = new Map()
  const recentRebated = new Set()
  for (const date of dayKeys(recentFrom, today)) for (const caterer of caterers) {
    const id = idOf(caterer)
    const scope = dayScope(id, date)
    for (const student of scope.onRebate) if (date >= sevenFrom) recentRebated.add(student)
    for (const slot of mealSlots(scope.period || {})) {
      if (mealState(date, slot, now) !== "ended") continue
      // Deduplicate a student's expected meal across overlapping caterer rosters.
      for (const student of scope.roster) {
        if (!allocatedStudents.has(student) || scope.onRebate.has(student)) continue
        addToSet(studentExpected, student, `${date}:${slot.key}`)
        if (attended.has(`${date}:${slot.key}:${id}:${student}`)) addToSet(studentAttended, student, `${date}:${slot.key}`)
      }
    }
  }
  const ever = new Set(scanSummary.everScanned.map((row) => idOf(row._id)))
  const students = { regulars: 0, ghosts: 0, neverScanned: 0 }
  for (const student of allocatedStudents) {
    const expected = studentExpected.get(student)?.size || 0
    if (expected && (studentAttended.get(student)?.size || 0) / expected >= 0.9) students.regulars++
    if (!recentRebated.has(student) && !scannedRecent.has(student)) students.ghosts++
    if (!ever.has(student)) students.neverScanned++
  }
  let busiestMeal = null
  for (const date of dates) for (const slot of slots) {
    const count = verifiedByMeal.get(`${date}:${slot.key}`)?.size || 0
    if (count && (!busiestMeal || count > busiestMeal.verified)) busiestMeal = { date, mealSlotKey: slot.key, verified: count }
  }
  const rankedMeals = slots.map((slot) => ({ mealSlotKey: slot.key, attendanceRate: rate(mealRates.get(slot.key)?.verified || 0, mealRates.get(slot.key)?.expected || 0) })).filter((entry) => entry.attendanceRate !== null).sort((a, b) => b.attendanceRate - a.attendanceRate)
  const current = currentPeriods[0]
  return success({
    generatedAt: now.toISOString(), today, from, to: today, days, timezone,
    totals: { caterers: caterers.filter((caterer) => currentCatererIds.has(idOf(caterer))).length, allocatedStudents: allocatedStudents.size, todayOnRebate: todayRebated.size, pendingRebates: rebates.filter((rebate) => rebate.status === "pending").length, currentPeriod: current ? { id: idOf(current), startDate: dayKey(current.startDate), endDate: dayKey(current.endDate) } : null },
    mealSlots: slots, currentMealSlotKey: current ? mealSlots(current).find((slot) => mealState(today, slot, now) === "serving")?.key || null : null,
    peaks, weekdayHeat, daily, caterers: catererRows, rebateForecast,
    scanner: { verified, issues, bySource }, students,
    records: { busiestMeal, busiestMinute: scanSummary.clockMinutes[0] ? { at: scanSummary.clockMinutes[0]._id.toISOString(), scans: scanSummary.clockMinutes[0].scans } : null, bestAttendedMeal: rankedMeals[0] || null, leastAttendedMeal: rankedMeals.at(-1) || null },
  })
}
