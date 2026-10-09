import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { catererFixture, periodFixture, studentFixture, scanFixture, rebateFixture, shift, keyFor, removeAllocationFixture } from "../../helpers/seed/dining-caterer.js"

beforeEach(setupTestDb)
afterAll(teardownTestDb)
const path = "/api/v1/dining-insights/overview"
const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  expect(res.body.message).toBeUndefined()
  return res.body.data
}
const overview = async (days = 7) => ok(await (await as(await seed.admin())).get(path).query({ days }))
const insightsFixture = async ({ slots, students = 4 } = {}) => {
  const login = await catererFixture()
  const today = keyFor()
  const date = shift(today, -1)
  const period = await periodFixture(login.caterer, shift(today, -30), shift(today, 60), {
    mealSlots: slots || [{ name: "All Day", startTime: "00:00", endTime: "23:59" }],
  })
  const roster = []
  for (let index = 0; index < students; index++) roster.push(await studentFixture(period, login.caterer, `Student ${index}`, `I${index}`))
  return { ...login, today, date, period, students: roster }
}

describe("dining insights authorization and validation", () => {
  it("requires authentication, Admin role, and the existing dashboard route grant", async () => {
    expect((await (await anon()).get(path)).status).toBe(401)
    const student = await seed.student({ authz: { override: { allowRoutes: ["route.admin.dashboard"] } } })
    expect((await (await as(student)).get(path)).status).toBe(403)
    const caterer = await catererFixture({ authz: { override: { allowRoutes: ["route.admin.dashboard"] } } })
    expect((await (await as(caterer.user)).get(path)).status).toBe(403)
    const denied = await seed.admin({ authz: { override: { denyRoutes: ["route.admin.dashboard"] } } })
    expect((await (await as(denied)).get(path)).status).toBe(403)
    ok(await (await as(await seed.admin())).get(path))
    ok(await (await as(await seed.createUser({ role: "Super Admin" }))).get(path))
    const deniedSuper = await seed.createUser({ role: "Super Admin", authz: { override: { denyRoutes: ["route.superAdmin.dashboard"] } } })
    expect((await (await as(deniedSuper)).get(path)).status).toBe(403)
  })
  it("defaults to 30 days, accepts both boundaries, rejects non-integer and repeated values", async () => {
    const api = await as(await seed.admin())
    expect(ok(await api.get(path)).days).toBe(30)
    for (const days of [7, 90]) expect(ok(await api.get(path).query({ days })).daily).toHaveLength(days)
    for (const days of ["", "6", "91", "7.5", "NaN", "Infinity", "-7", "1e1", " 7 ", "9007199254740992"]) {
      const res = await api.get(path).query({ days })
      expect(res.status, days).toBe(400)
      expect(res.body.success).toBe(false)
    }
    expect((await api.get(path + "?days=7&days=8")).status).toBe(400)
  })
  it("returns the complete empty shape, zero calendars and explicit null records without periods", async () => {
    const data = await overview()
    const runtimeZone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(data).toMatchObject({ days: 7, today: keyFor(), from: shift(keyFor(), -6), to: keyFor(), timezone: runtimeZone === "Asia/Calcutta" ? "Asia/Kolkata" : runtimeZone, totals: { caterers: 0, allocatedStudents: 0, todayOnRebate: 0, pendingRebates: 0, currentPeriod: null }, mealSlots: [], currentMealSlotKey: null, peaks: [], weekdayHeat: [], caterers: [], scanner: { verified: 0, issues: {}, bySource: { manual: 0, "face-scanner": 0 } }, students: { regulars: 0, ghosts: 0, neverScanned: 0 }, records: { busiestMeal: null, busiestMinute: null, bestAttendedMeal: null, leastAttendedMeal: null } })
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false)
    expect(data.daily).toHaveLength(7)
    expect(data.daily.every((day) => day.allocated === 0 && day.onRebate === 0 && day.expected === 0 && day.issues === 0 && Object.keys(day.meals).length === 0)).toBe(true)
    expect(data.rebateForecast).toHaveLength(14)
    expect(data.rebateForecast[0]).toEqual({ date: keyFor(), onRebate: 0, pending: 0, starting: 0, returning: 0 })
  })
})

describe("dining insights calculations", () => {
  it("uses first distinct arrivals for peaks, local 5-minute buckets, and inclusive percentiles", async () => {
    const f = await insightsFixture({ slots: [{ name: "Lunch", startTime: "12:02", endTime: "13:02" }] })
    const scan = (student, time, extra = {}) => scanFixture(f, student, { time, mealSlotKey: "lunch", ...extra })
    await scan(f.students[0], "12:00:10", { source: "face-scanner" })
    await scan(f.students[0], "12:30:00") // second verified scan is not an arrival
    await scan(f.students[1], "12:04:10")
    await scan(f.students[2], "12:10:00")
    await scan(f.students[3], "12:20:00")
    await scan(f.students[0], "12:40:00", { status: "duplicate" })
    const previous = shift(f.date, -1)
    await scan(f.students[0], "12:00:20", { date: previous })
    // An arrival at another caterer must not inflate the global distinct count.
    const other = await catererFixture()
    await scan(f.students[1], "12:06:00", { catererId: other.caterer._id })
    const data = await overview()
    const peak = data.peaks[0]
    expect(peak).toMatchObject({ mealSlotKey: "lunch", bucketMinutes: 5, peakMinute: 720, p10Minute: 720, medianMinute: 724, p90Minute: 736, activeDays: 2, avgDailyVerified: 2.5 })
    expect(peak.buckets[0]).toEqual({ minute: 690, avgScans: 0 })
    expect(peak.buckets.at(-1)).toEqual({ minute: 810, avgScans: 0 })
    expect(peak.buckets.find((bucket) => bucket.minute === 720).avgScans).toBe(1.5)
    expect(peak.buckets.find((bucket) => bucket.minute === 730).avgScans).toBe(0.5)
    expect(peak.buckets.find((bucket) => bucket.minute === 750).avgScans).toBe(0)
    expect(data.daily.find((day) => day.date === f.date).meals.lunch.verified).toBe(4)
    expect(data.scanner).toMatchObject({ verified: 7, issues: { duplicate: 1 }, bySource: { manual: 5, "face-scanner": 1 } })
  })
  it("matches caterer daily counts, weekday heat, per-caterer rates and records", async () => {
    const f = await insightsFixture({ slots: [{ name: "All Day", startTime: "00:00", endTime: "23:59" }, { name: "Evening", startTime: "23:58", endTime: "23:59" }] })
    const [alpha, beta, gamma] = f.students
    await scanFixture(f, alpha, { time: "12:00:10", source: "face-scanner" })
    await scanFixture(f, alpha, { time: "12:00:20" })
    await scanFixture(f, beta, { time: "12:00:30" })
    await scanFixture(f, gamma, { mealSlotKey: "evening", time: "23:58:00" })
    await scanFixture(f, alpha, { status: "duplicate" })
    await scanFixture(f, beta, { status: "wrong-caterer" })
    await scanFixture(f, alpha, { date: f.today, time: "00:00:00" })
    await rebateFixture(f, gamma)
    await rebateFixture(f, gamma) // duplicate approval covers one student
    await rebateFixture(f, beta, { from: f.today })
    await rebateFixture(f, alpha, { from: f.date, status: "pending" })
    const data = await overview()
    expect(data.totals).toMatchObject({ caterers: 1, allocatedStudents: 4, todayOnRebate: 1, pendingRebates: 0, currentPeriod: { id: String(f.period._id) } })
    expect(data.currentMealSlotKey).toBe("all-day")
    expect(data.daily.find((day) => day.date === f.date)).toEqual({ date: f.date, allocated: 4, onRebate: 1, expected: 3, meals: { "all-day": { verified: 2 }, evening: { verified: 1 } }, issues: 2 })
    expect(data.daily.at(-1)).toMatchObject({ allocated: 4, onRebate: 1, expected: 3, meals: { "all-day": { verified: 1 }, evening: { verified: 0 } } })
    const cat = data.caterers[0]
    expect(cat).toMatchObject({ id: String(f.caterer._id), allocated: 4, todayOnRebate: 1, todayExpected: 3, today: { "all-day": { verified: 1 }, evening: { verified: 0 } }, unusedPlates7d: 43 })
    expect(cat.attendanceRate).toBeCloseTo(3 / 46)
    expect(cat.rebateShare).toBeCloseTo(2 / 28)
    expect(cat.issueRate).toBeCloseTo(2 / 7)
    expect(cat.faceShare).toBeCloseTo(1 / 4)
    const yesterdayWeekday = new Date(`${f.date}T00:00:00`).getDay()
    expect(data.weekdayHeat.find((cell) => cell.weekday === yesterdayWeekday && cell.mealSlotKey === "all-day")).toEqual({ weekday: yesterdayWeekday, mealSlotKey: "all-day", attendanceRate: 2 / 3, samples: 1 })
    const todayWeekday = new Date(`${f.today}T00:00:00`).getDay()
    expect(data.weekdayHeat.find((cell) => cell.weekday === todayWeekday && cell.mealSlotKey === "all-day")).toMatchObject({ attendanceRate: null, samples: 0 })
    expect(data.records).toEqual({ busiestMeal: { date: f.date, mealSlotKey: "all-day", verified: 2 }, busiestMinute: { at: new Date(`${f.date}T12:00:00`).toISOString(), scans: 3 }, bestAttendedMeal: { mealSlotKey: "all-day", attendanceRate: 2 / 23 }, leastAttendedMeal: { mealSlotKey: "evening", attendanceRate: 1 / 23 } })
    const catererData = ok(await (await as(f.user)).get("/api/v1/dining-caterer/meal-records/overview").query({ periodId: String(f.period._id), from: data.from, to: data.to }))
    expect(data.daily.map((day) => ({ date: day.date, allocatedCount: day.allocated, onRebateCount: day.onRebate, expectedCount: day.expected, meals: Object.fromEntries(Object.entries(day.meals).map(([key, meal]) => [key, { verifiedCount: meal.verified }])) }))).toEqual(catererData.days)
  })
  it("uses dateKeys for forecast coverage, starting/returning, pending students and pending request totals", async () => {
    const f = await insightsFixture()
    const [alpha, beta, gamma, delta] = f.students
    await rebateFixture(f, alpha, { from: f.today, to: shift(f.today, 2) })
    await rebateFixture(f, alpha, { from: f.today, to: shift(f.today, 2) })
    await rebateFixture(f, beta, { from: f.date, to: f.date })
    await rebateFixture(f, gamma, { from: shift(f.today, 1), to: shift(f.today, 3), status: "pending" })
    await rebateFixture(f, gamma, { from: shift(f.today, 1), status: "pending" })
    await rebateFixture(f, delta, { from: shift(f.today, 40), status: "pending" })
    await rebateFixture(f, delta, { from: f.today, status: "rejected" })
    const data = await overview(90)
    expect(data.rebateForecast[0]).toEqual({ date: f.today, onRebate: 1, pending: 0, starting: 1, returning: 1 })
    expect(data.rebateForecast[1]).toEqual({ date: shift(f.today, 1), onRebate: 1, pending: 1, starting: 0, returning: 0 })
    expect(data.rebateForecast[3]).toEqual({ date: shift(f.today, 3), onRebate: 0, pending: 1, starting: 0, returning: 1 })
    expect(data.totals.pendingRebates).toBe(3)
  })
  it("computes regulars over 14 days even for days=7, excludes rebates and finds ghosts and never-scanned", async () => {
    const f = await insightsFixture()
    const [regular, rebated, ghost, never] = f.students
    for (let offset = -13; offset < 0; offset++) await scanFixture(f, regular, { date: shift(f.today, offset) })
    await rebateFixture(f, regular, { from: shift(f.today, -10) })
    await rebateFixture(f, rebated, { from: f.date })
    await scanFixture(f, ghost, { date: shift(f.today, -20) })
    // A scan from another period does not count toward current-period history.
    const old = await periodFixture(f.caterer, shift(f.today, -60), shift(f.today, -40))
    await scanFixture(f, never, { date: shift(f.today, -50), periodId: old._id })
    const data = await overview()
    expect(data.students).toEqual({ regulars: 1, ghosts: 2, neverScanned: 2 })
    expect(data.scanner.verified).toBe(6)
  })
  it("selects latest slot definitions and per-caterer periods, orders caterers, and preserves historical scans after roster changes", async () => {
    const f = await insightsFixture({ students: 1 })
    const other = await catererFixture()
    const newer = await periodFixture(other.caterer, shift(f.today, -2), shift(f.today, 2), { mealSlots: [{ name: "All Day", startTime: "01:00", endTime: "23:59" }, { name: "Night", startTime: "22:00", endTime: "02:00" }] })
    await studentFixture(newer, other.caterer, "Other", "OTHER")
    await scanFixture(f, f.students[0])
    await removeAllocationFixture(f.students[0])
    const data = await overview()
    expect(data.mealSlots).toEqual([{ key: "all-day", name: "All Day", startTime: "01:00", endTime: "23:59" }, { key: "night", name: "Night", startTime: "22:00", endTime: "02:00" }])
    expect(data.totals).toMatchObject({ caterers: 2, allocatedStudents: 1, currentPeriod: { id: String(newer._id) } })
    expect(data.caterers.map((row) => row.name)).toEqual(data.caterers.map((row) => row.name).sort())
    expect(data.caterers.find((row) => row.id === String(f.caterer._id))).toMatchObject({ allocated: 0, attendanceRate: null, rebateShare: null, unusedPlates7d: 0, faceShare: 0, issueRate: 0 })
    expect(data.daily.find((day) => day.date === f.date).meals["all-day"].verified).toBe(1)
    const emptyPeak = data.peaks.find((peak) => peak.mealSlotKey === "night")
    expect(emptyPeak).toMatchObject({ peakMinute: null, p10Minute: null, medianMinute: null, p90Minute: null, activeDays: 0, avgDailyVerified: null })
    expect(emptyPeak.buckets).toHaveLength(288)
  })
})
