import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { fixture, catererFixture, periodFixture, studentFixture, removeAllocationFixture, scanFixture, rebateFixture, roomFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/dining-caterer"
const routes = ["/meal-records/options", "/meal-records/overview", "/meal-records", "/rebates/overview", "/rebates/day", "/rebates"]
const mealQuery = (f, extra = {}) => ({ periodId: String(f.period._id), date: f.date, mealSlotKey: "all-day", ...extra })
const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  expect(res.body.message).toBeUndefined()
  return res.body.data
}

describe("dining caterer — authorization", () => {
  it.each(routes)("requires a session: %s", async (route) => {
    expect((await (await anon()).get(base + route)).status).toBe(401)
  })
  it.each(routes)("rejects wrong role and Office even with explicit grants: %s", async (route) => {
    const admin = await as(await seed.admin())
    expect((await admin.get(base + route)).status).toBe(403)
    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { allowRoutes: ["route.caterer.mealRecords", "route.caterer.rebates"] } } }))
    expect((await office.get(base + route)).status).toBe(403)
  })
  it.each(routes)("enforces its own route key: %s", async (route) => {
    const key = route.startsWith("/meal-records") ? "route.caterer.mealRecords" : "route.caterer.rebates"
    const { user } = await catererFixture({ authz: { override: { denyRoutes: [key] } } })
    expect((await (await as(user)).get(base + route)).status).toBe(403)
  })
  it.each(routes)("404 for an unlinked Caterer: %s", async (route) => {
    const api = await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))
    const res = await api.get(base + route)
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/caterer login/i)
  })
  it("the new routes work when mealVerification is denied; rebate and meal access are independent", async () => {
    const { user } = await catererFixture({ authz: { override: { denyRoutes: ["route.caterer.mealVerification", "route.caterer.rebates"] } } })
    const api = await as(user)
    ok(await api.get(base + "/meal-records/options"))
    expect((await api.get(base + "/rebates")).status).toBe(403)
  })
})

describe("dining caterer — meal records", () => {
  it("options includes only this caterer's periods, archives, normalized slots, newest first", async () => {
    const { user, caterer } = await catererFixture()
    const today = keyFor()
    const old = await periodFixture(caterer, shift(today, -60), shift(today, -30), { isArchived: true })
    const current = await periodFixture(caterer, shift(today, -10), shift(today, 10))
    const future = await periodFixture(caterer, shift(today, 20), shift(today, 30))
    const other = await catererFixture()
    await periodFixture(other.caterer, shift(today, -1), shift(today, 1))
    const data = ok(await (await as(user)).get(base + "/meal-records/options"))
    expect(data).toMatchObject({ caterer: { id: String(caterer._id) }, today, currentPeriodId: String(current._id), currentMealSlotKey: "all-day" })
    expect(data.periods.map((period) => period.id)).toEqual([future, current, old].map((period) => String(period._id)))
    expect(data.periods[1]).toMatchObject({ isArchived: false, isCurrent: true, startDate: shift(today, -10), mealSlots: [{ key: "all-day", name: "All Day", startTime: "00:00", endTime: "23:59" }, { key: "lunch", name: "Lunch", startTime: "12:00", endTime: "15:00" }] })
  })
  it("options has explicit nulls and empty arrays without any periods", async () => {
    const { user } = await catererFixture()
    expect(ok(await (await as(user)).get(base + "/meal-records/options"))).toMatchObject({ currentPeriodId: null, currentMealSlotKey: null, periods: [] })
  })
  it("overview deduplicates verified students and approved rebates, ignores other attempts and caterers", async () => {
    const f = await fixture()
    const [alpha, beta, gamma] = f.students
    await scanFixture(f, alpha, { source: "face-scanner" })
    await scanFixture(f, alpha, { time: "12:01:00" })
    await scanFixture(f, alpha, { status: "duplicate", time: "12:02:00" })
    await scanFixture(f, beta, { status: "on-rebate" })
    await scanFixture(f, gamma, { mealSlotKey: "lunch" })
    await scanFixture(f, gamma, { date: shift(f.date, -1) })
    await rebateFixture(f, beta)
    await rebateFixture(f, beta)
    await rebateFixture(f, gamma, { status: "pending" })
    const outsider = await catererFixture()
    await scanFixture(f, gamma, { catererId: outsider.caterer._id })
    const data = ok(await (await as(f.user)).get(base + "/meal-records/overview").query({ periodId: String(f.period._id), from: shift(f.date, -1), to: f.date }))
    expect(data.days).toEqual([
      { date: shift(f.date, -1), allocatedCount: 4, onRebateCount: 0, expectedCount: 4, meals: { "all-day": { verifiedCount: 1 }, lunch: { verifiedCount: 0 } } },
      { date: f.date, allocatedCount: 4, onRebateCount: 1, expectedCount: 3, meals: { "all-day": { verifiedCount: 1 }, lunch: { verifiedCount: 1 } } },
    ])
  })
  it("overview defaults to 14 days, clamps to the period, and returns zero counts for empty rosters", async () => {
    const { user, caterer } = await catererFixture()
    const today = keyFor()
    const period = await periodFixture(caterer, shift(today, -4), today)
    const api = await as(user)
    const data = ok(await api.get(base + "/meal-records/overview").query({ periodId: String(period._id) }))
    expect(data).toMatchObject({ from: shift(today, -4), to: today })
    expect(data.days).toHaveLength(5)
    expect(data.days[0]).toMatchObject({ allocatedCount: 0, onRebateCount: 0, expectedCount: 0 })
    const clamped = ok(await api.get(base + "/meal-records/overview").query({ periodId: String(period._id), from: shift(today, -10), to: shift(today, 5) }))
    expect(clamped.days).toHaveLength(5)
    const future = await periodFixture(caterer, shift(today, 10), shift(today, 20))
    expect((await api.get(base + "/meal-records/overview").query({ periodId: String(future._id) })).status).toBe(400)
    expect(ok(await api.get(base + "/meal-records/overview").query({ periodId: String(future._id), from: shift(today, 10), to: shift(today, 15) })).days).toHaveLength(6)
  })
  it("whole roster has verified/on-rebate/missed states, first verification, all attempts, and newest issues", async () => {
    const f = await fixture()
    const [alpha, beta, gamma, delta] = f.students
    const hostel = await roomFixture(alpha)
    await roomFixture(delta, { unitBased: false })
    const first = await scanFixture(f, alpha, { source: "face-scanner", time: "00:00:00" })
    await scanFixture(f, alpha, { source: "manual", time: "12:01:00" })
    await scanFixture(f, alpha, { status: "duplicate", time: "12:02:00" })
    await scanFixture(f, alpha, { date: shift(f.date, 1), time: "00:00:00" })
    await scanFixture(f, delta)
    await rebateFixture(f, beta)
    await rebateFixture(f, gamma, { status: "pending" })
    await scanFixture(f, beta, { status: "on-rebate", time: "12:03:00" })
    await scanFixture(f, null, { status: "unknown-student", time: "12:04:00" })
    const data = ok(await (await as(f.user)).get(base + "/meal-records").query(mealQuery(f)))
    expect(data.mealState).toBe("ended")
    expect(data.summary).toEqual({ allocatedCount: 4, onRebateCount: 1, expectedCount: 3, verifiedCount: 2, missedCount: 1, pendingCount: 0, manualCount: 1, faceCount: 1, issueCount: 3 })
    expect(data.students.map((row) => row.status)).toEqual(["verified", "on-rebate", "missed", "verified"])
    expect(data.students[0]).toMatchObject({ allocationId: String(alpha.allocation._id), verifiedAt: first.scannedAt.toISOString(), verificationSource: "face-scanner", attemptCount: 3, student: { id: String(alpha.user._id), profileId: String(alpha.profile._id), name: "Alpha Student", department: "CSE", degree: "B.Tech", batch: "2025", hostel: { id: String(hostel._id), name: hostel.name }, room: { displayRoom: "A-101" } } })
    expect(data.students[3].student.room).toEqual({ displayRoom: "101" })
    expect(data.students[1]).toMatchObject({ verifiedAt: null, verificationSource: null, rebate: { dayCount: 1, type: "short-term" } })
    expect(data.students[2].student).toMatchObject({ hostel: null, room: null })
    expect(data.issues.map((issue) => issue.status)).toEqual(["unknown-student", "on-rebate", "duplicate"])
    expect(data.issues[2]).toMatchObject({ student: { id: String(alpha.user._id) }, caterer: { id: String(f.caterer._id) }, mealSlotKey: "all-day", source: "manual" })
  })
  it("future and serving meals mark expected unverified students pending, with missedCount zero", async () => {
    const f = await fixture()
    const api = await as(f.user)
    for (const [date, state] of [[f.today, "serving"], [shift(f.today, 1), "upcoming"]]) {
      await rebateFixture(f, f.students[1], { from: date })
      const data = ok(await api.get(base + "/meal-records").query(mealQuery(f, { date })))
      expect(data.mealState).toBe(state)
      expect(data.summary).toMatchObject({ pendingCount: 3, missedCount: 0, expectedCount: 3 })
      expect(data.students.map((row) => row.status)).toEqual(["pending", "on-rebate", "pending", "pending"])
    }
  })
  it("a verified student on rebate stays verified, without inflating expected missed counts", async () => {
    const f = await fixture()
    await rebateFixture(f, f.students[0])
    await scanFixture(f, f.students[0])
    const data = ok(await (await as(f.user)).get(base + "/meal-records").query(mealQuery(f)))
    expect(data.students[0]).toMatchObject({ status: "verified", rebate: { dayCount: 1 } })
    expect(data.summary).toMatchObject({ verifiedCount: 1, onRebateCount: 1, expectedCount: 3, missedCount: 3 })
  })
  it("keeps historical verified totals and first sources after allocations are removed", async () => {
    const f = await fixture()
    const [alpha, beta] = f.students
    await scanFixture(f, alpha, { status: "duplicate", source: "manual", time: "11:00:00" })
    await scanFixture(f, alpha, { source: "face-scanner", time: "12:00:00" })
    await scanFixture(f, alpha, { source: "manual", time: "12:01:00" })
    await scanFixture(f, beta, { source: "manual", time: "12:00:00" })
    await scanFixture(f, beta, { source: "face-scanner", time: "12:01:00" })
    const api = await as(f.user)
    expect(ok(await api.get(base + "/meal-records").query(mealQuery(f))).summary)
      .toMatchObject({ verifiedCount: 2, manualCount: 1, faceCount: 1 })
    for (const student of [alpha, beta]) expect(await removeAllocationFixture(student)).toMatchObject({ ok: true })
    const overview = ok(await api.get(base + "/meal-records/overview").query({ periodId: String(f.period._id), from: f.date, to: f.date }))
    const detail = ok(await api.get(base + "/meal-records").query(mealQuery(f)))
    expect(overview.days[0].meals["all-day"].verifiedCount).toBe(2)
    expect(detail.summary).toEqual({ allocatedCount: 2, onRebateCount: 0, expectedCount: 2, verifiedCount: 2, missedCount: 2, pendingCount: 0, manualCount: 1, faceCount: 1, issueCount: 1 })
    expect(detail.summary.verifiedCount).toBe(overview.days[0].meals["all-day"].verifiedCount)
    expect(detail.students.map((row) => row.student.id)).toEqual(f.students.slice(2).map((student) => String(student.user._id)))
    expect(detail.issues[0].student.id).toBe(String(alpha.user._id))
  })
  it("caps issues at the newest 200 and counts the returned list", async () => {
    const f = await fixture()
    const { DiningMealVerification } = await import("../../../src/models/index.js")
    await DiningMealVerification.insertMany(Array.from({ length: 205 }, (_, i) => ({ periodId: f.period._id, catererId: f.caterer._id, rollNumber: `GHOST${i}`, mealSlotKey: "all-day", status: "unknown-student", scannedAt: new Date(new Date(`${f.date}T12:00:00`).getTime() + i * 1000) })))
    await scanFixture(f, f.students[0], { time: "13:00:00" })
    const data = ok(await (await as(f.user)).get(base + "/meal-records").query(mealQuery(f)))
    expect(data.issues).toHaveLength(200)
    expect(data.summary.issueCount).toBe(200)
    expect(data.issues[0].rollNumber).toBe("GHOST204")
    expect(data.issues.at(-1).rollNumber).toBe("GHOST5")
    expect(data.summary.verifiedCount).toBe(1)
    expect(data.students[0]).toMatchObject({ status: "verified", attemptCount: 1 })
  })
})

describe("dining caterer — rebates", () => {
  it("overview and day report distinct approved/pending/starting/returning students and enriched lists", async () => {
    const f = await fixture()
    const [alpha, beta, gamma, delta] = f.students
    await roomFixture(alpha)
    await rebateFixture(f, alpha, { from: shift(f.today, -2), to: shift(f.today, 1) })
    await rebateFixture(f, alpha, { from: shift(f.today, -1), to: shift(f.today, 1) })
    const starts = await rebateFixture(f, beta, { from: f.today, to: shift(f.today, 2) })
    await rebateFixture(f, gamma, { from: f.today, to: shift(f.today, 2), status: "pending" })
    const returns = await rebateFixture(f, delta, { from: shift(f.today, -3), to: shift(f.today, -1) })
    await rebateFixture(f, delta, { from: f.today, status: "rejected" })
    const api = await as(f.user)
    const data = ok(await api.get(base + "/rebates/overview").query({ from: f.today, to: shift(f.today, 3) }))
    expect(data.days[0]).toEqual({ date: f.today, periodId: String(f.period._id), allocatedCount: 4, onRebateCount: 2, pendingCount: 1, expectedCount: 2, startingCount: 1, returningCount: 1 })
    expect(data.days[2]).toMatchObject({ onRebateCount: 1, returningCount: 1 })
    expect(data.days[3]).toMatchObject({ onRebateCount: 0, pendingCount: 0, returningCount: 1 })
    const day = ok(await api.get(base + "/rebates/day").query({ date: f.today }))
    expect(day).toMatchObject({ date: f.today, periodId: String(f.period._id), allocatedCount: 4, onRebateCount: 2, pendingCount: 1, expectedCount: 2 })
    expect(day.onRebate).toHaveLength(2)
    const betaRow = day.onRebate.find((row) => row.student.id === String(beta.user._id))
    expect(betaRow).toMatchObject({ rebate: { id: String(starts._id), student: { profileImage: beta.user.profileImage } }, dayNumber: 1, dayCount: 3 })
    const alphaRow = day.onRebate.find((row) => row.student.id === String(alpha.user._id))
    expect(alphaRow.dayNumber).toBe(alphaRow.rebate.dateKeys.indexOf(f.today) + 1)
    expect(alphaRow.student.room).toEqual({ displayRoom: "A-101" })
    expect(day.pending[0].student.id).toBe(String(gamma.user._id))
    expect(day.starting[0].rebate.id).toBe(String(starts._id))
    expect(day.returning[0].rebate.id).toBe(String(returns._id))
  })
  it("calendar defaults to 14 days and returns explicit zero/empty states without a period", async () => {
    const { user } = await catererFixture()
    const api = await as(user)
    const data = ok(await api.get(base + "/rebates/overview"))
    expect(data).toMatchObject({ today: keyFor(), from: keyFor(), to: shift(keyFor(), 13) })
    expect(data.days).toHaveLength(14)
    expect(data.days[0]).toEqual({ date: keyFor(), periodId: null, allocatedCount: 0, onRebateCount: 0, pendingCount: 0, expectedCount: 0, startingCount: 0, returningCount: 0 })
    expect(ok(await api.get(base + "/rebates/day").query({ date: keyFor() }))).toEqual({ date: keyFor(), periodId: null, allocatedCount: 0, onRebateCount: 0, pendingCount: 0, expectedCount: 0, onRebate: [], pending: [], starting: [], returning: [] })
    expect(ok(await api.get(base + "/rebates"))).toEqual({ rebates: [], counts: { all: 0, approved: 0, pending: 0, rejected: 0 }, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } })
  })
  it("uses the latest non-archived period for overlaps and supports past dates", async () => {
    const f = await fixture()
    await rebateFixture(f, f.students[0])
    const latest = await periodFixture(f.caterer, shift(f.today, -5), shift(f.today, 5))
    const student = await studentFixture(latest, f.caterer, "Latest Student", "Z")
    const newer = { ...f, period: latest }
    await rebateFixture(newer, student)
    await periodFixture(f.caterer, f.date, shift(f.today, 2), { isArchived: true })
    const data = ok(await (await as(f.user)).get(base + "/rebates/overview").query({ from: f.date, to: f.date }))
    expect(data.days[0]).toMatchObject({ periodId: String(latest._id), allocatedCount: 1, onRebateCount: 1, expectedCount: 0 })
  })
  it("list filters status, overlap, period, name/roll search and paginates; counts ignore status", async () => {
    const f = await fixture()
    const [alpha, beta] = f.students
    await rebateFixture(f, alpha, { from: f.date, to: shift(f.today, 2) })
    const newest = await rebateFixture(f, alpha, { from: f.today, status: "pending" })
    await rebateFixture(f, alpha, { from: f.today, status: "rejected" })
    await rebateFixture(f, beta, { from: shift(f.today, -10) })
    const archived = await periodFixture(f.caterer, shift(f.today, -60), shift(f.today, -30), { isArchived: true })
    await rebateFixture({ ...f, period: archived }, alpha, { from: shift(f.today, -40) })
    const outsider = await fixture()
    await rebateFixture(outsider, outsider.students[0], { from: f.today })
    const api = await as(f.user)
    const filters = { periodId: String(f.period._id), from: f.today, to: f.today, search: "aLPHa" }
    const approved = ok(await api.get(base + "/rebates").query({ ...filters, status: "approved" }))
    expect(approved.counts).toEqual({ all: 3, approved: 1, pending: 1, rejected: 1 })
    expect(approved.pagination).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 })
    expect(approved.rebates[0]).toMatchObject({ student: { name: alpha.user.name, profileImage: alpha.user.profileImage }, dateKeys: [f.date, f.today, shift(f.today, 1), shift(f.today, 2)] })
    const pending = ok(await api.get(base + "/rebates").query({ ...filters, status: "pending" }))
    expect(pending.rebates.map((rebate) => rebate.id)).toEqual([String(newest._id)])
    expect(pending.counts).toEqual(approved.counts)
    const page = ok(await api.get(base + "/rebates").query({ ...filters, limit: 1, page: 2 }))
    expect(page.pagination).toEqual({ total: 3, page: 2, limit: 1, totalPages: 3 })
    expect(page.rebates).toHaveLength(1)
    const roll = ok(await api.get(base + "/rebates").query({ search: alpha.profile.rollNumber.toLowerCase() }))
    expect(roll.counts.all).toBe(4)
    const literal = ok(await api.get(base + "/rebates").query({ search: ".*" }))
    expect(literal.counts.all).toBe(0)
    const beyond = ok(await api.get(base + "/rebates").query({ ...filters, page: 99 }))
    expect(beyond.rebates).toEqual([])
    expect(beyond.pagination.total).toBe(3)
    const fromOnly = ok(await api.get(base + "/rebates").query({ from: f.today }))
    expect(fromOnly.counts.all).toBe(3)
    const toOnly = ok(await api.get(base + "/rebates").query({ to: shift(f.today, -30) }))
    expect(toOnly.counts.all).toBe(1)
  })
})

describe("dining caterer — validation", () => {
  it.each(routes)("quickly rejects every out-of-range date parameter on %s", async (route) => {
    const f = await fixture()
    const api = await as(f.user)
    for (const param of ["date", "from", "to"]) {
      for (const value of ["1999-12-31", "2101-01-01", "9999-12-31"]) {
        const query = { ...(route.startsWith("/meal-records") ? mealQuery(f) : route === "/rebates/day" ? { date: f.date } : {}), [param]: value }
        const res = await api.get(base + route).query(query).timeout({ response: 1000, deadline: 2000 })
        expect(res.status, JSON.stringify(res.body)).toBe(400)
        expect(res.body).toMatchObject({ success: false, message: expect.stringContaining(param) })
      }
    }
  })
  it.each(["2000-01-01", "2100-12-31"])("handles adjacent calendar days safely at the accepted boundary %s", async (date) => {
    const { user, caterer } = await catererFixture()
    const period = await periodFixture(caterer, date, date)
    const api = await as(user)
    expect(ok(await api.get(base + "/rebates/day").query({ date }))).toMatchObject({ date, periodId: String(period._id) })
    expect(ok(await api.get(base + "/rebates/overview").query({ from: date, to: date })).days).toHaveLength(1)
    expect(ok(await api.get(base + "/meal-records/overview").query({ periodId: String(period._id), from: date, to: date })).days).toHaveLength(1)
    expect(ok(await api.get(base + "/meal-records").query({ periodId: String(period._id), date, mealSlotKey: "all-day" })).summary.verifiedCount).toBe(0)
  })
  it.each([
    ["/meal-records/overview", {}, /periodId/],
    ["/meal-records/overview", { periodId: "bad" }, /periodId/],
    ["/meal-records", { date: "2026-02-30", mealSlotKey: "all-day" }, /date/],
    ["/meal-records", { date: "2026-1-01", mealSlotKey: "all-day" }, /date/],
    ["/meal-records", { date: "2026-01-01" }, /mealSlotKey/],
    ["/meal-records", { date: "2026-01-01", mealSlotKey: "all-day" }, /within/],
    ["/meal-records", { mealSlotKey: "invalid" }, /mealSlotKey/],
    ["/meal-records/overview", { from: "2026-10-10", to: "2026-10-01" }, /from/],
    ["/meal-records/overview", { from: "2026-01-01", to: "2026-03-05" }, /62/],
    ["/rebates/overview", { from: "2026-01-01", to: "2026-04-03" }, /92/],
    ["/rebates/overview", { from: "2026-02-30" }, /from/],
    ["/rebates/day", {}, /date/],
    ["/rebates/day", { date: "nope" }, /date/],
    ["/rebates", { status: "cancelled" }, /status/],
    ["/rebates", { page: "0" }, /page/],
    ["/rebates", { page: "1.5" }, /page/],
    ["/rebates", { page: "9007199254740992" }, /page/],
    ["/rebates", { page: "9007199254740991", limit: "100" }, /page/],
    ["/rebates", { limit: "101" }, /limit/],
    ["/rebates", { limit: "-1" }, /limit/],
    ["/rebates", { periodId: "bad" }, /periodId/],
    ["/rebates", { from: "2026-10-08", to: "2026-10-01" }, /from/],
    ["/rebates", { search: ["one", "two"] }, /search/],
  ])("400 for invalid %s query %j", async (route, invalid, message) => {
    const f = await fixture()
    let query = { ...invalid }
    if (route.startsWith("/meal-records")) {
      query = { periodId: String(f.period._id), ...(route === "/meal-records" ? { date: f.date, mealSlotKey: "all-day" } : {}), ...invalid }
      if (!Object.keys(invalid).length) query = {}
      if (route === "/meal-records" && invalid.date && !invalid.mealSlotKey) delete query.mealSlotKey
    }
    const res = await (await as(f.user)).get(base + route).query(query)
    expect(res.status, JSON.stringify(res.body)).toBe(400)
    expect(res.body).toMatchObject({ success: false, message: expect.stringMatching(message) })
  })
  it("rejects foreign periods; unknown periods return 404", async () => {
    const f = await fixture()
    const other = await fixture()
    const api = await as(f.user)
    for (const route of ["/meal-records/overview", "/meal-records", "/rebates"]) {
      expect((await api.get(base + route).query(mealQuery(f, { periodId: String(other.period._id) }))).status).toBe(400)
      expect((await api.get(base + route).query(mealQuery(f, { periodId: String(new mongoose.Types.ObjectId()) }))).status).toBe(404)
    }
  })
  it("rejects non-overlapping meal ranges and accepts the inclusive maximum span", async () => {
    const f = await fixture()
    const api = await as(f.user)
    expect((await api.get(base + "/meal-records/overview").query({ periodId: String(f.period._id), from: shift(f.today, -90), to: shift(f.today, -80) })).status).toBe(400)
    const data = ok(await api.get(base + "/rebates/overview").query({ from: f.today, to: shift(f.today, 91) }))
    expect(data.days).toHaveLength(92)
    expect((await api.get(base + "/rebates/overview").query({ from: f.today, to: shift(f.today, 92) })).status).toBe(400)
    const period = await periodFixture(f.caterer, f.today, shift(f.today, 100))
    const mealRange = { periodId: String(period._id), from: f.today, to: shift(f.today, 61) }
    expect(ok(await api.get(base + "/meal-records/overview").query(mealRange)).days).toHaveLength(62)
    expect((await api.get(base + "/meal-records/overview").query({ ...mealRange, to: shift(f.today, 62) })).status).toBe(400)
  })
})
