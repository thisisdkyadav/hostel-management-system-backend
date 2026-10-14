import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { DiningPeriod } from "../../../src/models/index.js"
import { catererFixture, periodFixture, studentFixture, scanFixture, rebateFixture, roomFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/dining-oversight"
const routes = ["/meal-records/options", "/meal-records/overview", "/meal-records/pulse", "/meal-records", "/feed"]
const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const office = (extra = {}) => seed.createUser({ role: "Dining", subRole: "Office", ...extra })

/** One period shared by two caterers: "Alpha" feeds two students, "Beta" feeds one. */
const sharedFixture = async () => {
  const a = await catererFixture()
  const b = await catererFixture()
  const today = keyFor()
  const date = shift(today, -1)
  const period = await periodFixture(a.caterer, shift(today, -20), shift(today, 20))
  await DiningPeriod.updateOne({ _id: period._id }, { catererIds: [a.caterer._id, b.caterer._id] })
  const fa = { caterer: a.caterer, period, date }
  const fb = { caterer: b.caterer, period, date }
  const s1 = await studentFixture(period, a.caterer, "Asha One", "A")
  const s2 = await studentFixture(period, a.caterer, "Bilal Two", "B")
  const s3 = await studentFixture(period, b.caterer, "Chen Three", "C")
  return { a, b, today, date, period, fa, fb, students: [s1, s2, s3] }
}
const mealQuery = (f, extra = {}) => ({ periodId: String(f.period._id), date: f.date, mealSlotKey: "all-day", ...extra })

describe("dining oversight — authorization", () => {
  it.each(routes)("requires a session: %s", async (route) => {
    expect((await (await anon()).get(base + route)).status).toBe(401)
  })
  it.each(routes)("rejects students and caterer logins: %s", async (route) => {
    expect((await (await as(await seed.student())).get(base + route)).status).toBe(403)
    const { user } = await catererFixture()
    expect((await (await as(user)).get(base + route)).status).toBe(403)
  })
  it("admin and the dining office get in; a denied caterers key keeps the office out", async () => {
    ok(await (await as(await seed.admin())).get(base + "/meal-records/options"))
    ok(await (await as(await office())).get(base + "/meal-records/options"))
    const denied = await office({ authz: { override: { denyRoutes: ["route.admin.caterers"] } } })
    expect((await (await as(denied)).get(base + "/meal-records/options")).status).toBe(403)
  })
  it("validates catererId", async () => {
    const api = await as(await office())
    expect((await api.get(base + "/feed").query({ catererId: "nope" })).status).toBe(400)
    expect((await api.get(base + "/feed").query({ catererId: "64b000000000000000000000" })).status).toBe(404)
  })
})

describe("dining oversight — every caterer", () => {
  it("options lists every caterer and period, and a caterer filter narrows the periods", async () => {
    const f = await sharedFixture()
    const solo = await catererFixture()
    const soloPeriod = await periodFixture(solo.caterer, shift(f.today, 30), shift(f.today, 40))
    const api = await as(await office())
    const data = ok(await api.get(base + "/meal-records/options"))
    expect(data.caterer).toBeNull()
    expect(data.caterers.map((c) => c.id)).toEqual(expect.arrayContaining([f.a.caterer, f.b.caterer, solo.caterer].map((c) => String(c._id))))
    const shared = data.periods.find((p) => p.id === String(f.period._id))
    expect(shared.catererIds).toEqual([String(f.a.caterer._id), String(f.b.caterer._id)])
    expect(data.periods.some((p) => p.id === String(soloPeriod._id))).toBe(true)
    const narrowed = ok(await api.get(base + "/meal-records/options").query({ catererId: String(f.b.caterer._id) }))
    expect(narrowed.caterer).toMatchObject({ id: String(f.b.caterer._id) })
    expect(narrowed.periods.some((p) => p.id === String(soloPeriod._id))).toBe(false)
    expect(narrowed.periods.some((p) => p.id === String(f.period._id))).toBe(true)
  })

  it("a meal record covers both kitchens with a per-caterer breakdown, and filters to one", async () => {
    const f = await sharedFixture()
    const [s1, s2, s3] = f.students
    const hostel = await roomFixture(s3)
    await scanFixture(f.fa, s1, { source: "face-scanner" })
    await rebateFixture(f.fa, s2)
    await scanFixture(f.fb, s3)
    await scanFixture(f.fb, null, { status: "unknown-student", time: "12:05:00" })
    const api = await as(await seed.admin())
    const all = ok(await api.get(base + "/meal-records").query(mealQuery(f)))
    expect(all.caterer).toBeNull()
    expect(all.summary).toMatchObject({ allocatedCount: 3, onRebateCount: 1, expectedCount: 2, verifiedCount: 2, faceCount: 1, manualCount: 1, issueCount: 1, missedCount: 0 })
    expect(all.caterers).toHaveLength(2)
    const byId = Object.fromEntries(all.caterers.map((c) => [c.id, c]))
    expect(byId[String(f.a.caterer._id)]).toMatchObject({ allocatedCount: 2, onRebateCount: 1, expectedCount: 1, verifiedCount: 1, issueCount: 0 })
    expect(byId[String(f.b.caterer._id)]).toMatchObject({ allocatedCount: 1, expectedCount: 1, verifiedCount: 1, issueCount: 1 })
    const chen = all.students.find((row) => row.student.name === "Chen Three")
    expect(chen).toMatchObject({ status: "verified", caterer: { id: String(f.b.caterer._id), name: f.b.caterer.name }, student: { hostel: { id: String(hostel._id) } } })

    const one = ok(await api.get(base + "/meal-records").query(mealQuery(f, { catererId: String(f.a.caterer._id) })))
    expect(one.caterer).toMatchObject({ id: String(f.a.caterer._id) })
    expect(one.students.map((row) => row.student.name)).toEqual(["Asha One", "Bilal Two"])
    expect(one.caterers.map((c) => c.id)).toEqual([String(f.a.caterer._id)])
    expect(one.summary).toMatchObject({ allocatedCount: 2, verifiedCount: 1, issueCount: 0 })
  })

  it("rejects a caterer that does not serve the period", async () => {
    const f = await sharedFixture()
    const stranger = await catererFixture()
    const res = await (await as(await office())).get(base + "/meal-records").query(mealQuery(f, { catererId: String(stranger.caterer._id) }))
    expect(res.status).toBe(400)
  })

  it("the overview grid sums every kitchen", async () => {
    const f = await sharedFixture()
    await scanFixture(f.fa, f.students[0])
    await scanFixture(f.fb, f.students[2])
    const data = ok(await (await as(await office())).get(base + "/meal-records/overview").query({ periodId: String(f.period._id), from: f.date, to: f.date }))
    expect(data.days).toEqual([expect.objectContaining({ date: f.date, allocatedCount: 3, meals: expect.objectContaining({ "all-day": { verifiedCount: 2 } }) })])
  })

  it("pulse returns counts and arrival times without the roster", async () => {
    const f = await sharedFixture()
    const scan = await scanFixture(f.fa, f.students[0], { time: "12:10:00" })
    await scanFixture(f.fb, f.students[2], { time: "12:20:00" })
    const data = ok(await (await as(await office())).get(base + "/meal-records/pulse").query(mealQuery(f)))
    expect(data.students).toBeUndefined()
    expect(data.issues).toBeUndefined()
    expect(data.summary).toMatchObject({ verifiedCount: 2, allocatedCount: 3 })
    expect(data.caterers).toHaveLength(2)
    expect(data.arrivals).toContainEqual({ studentId: String(f.students[0].user._id), catererId: String(f.a.caterer._id), at: scan.scannedAt.toISOString() })
    expect(data.arrivals).toHaveLength(2)
    const alpha = data.caterers.find((c) => c.id === String(f.a.caterer._id))
    expect(alpha).toMatchObject({ verifiedCount: 1, manualCount: 1, faceCount: 0, missedCount: 1 })
  })

  it("feed shows scans from every caterer newest first with rooms, and filters by caterer and meal", async () => {
    const f = await sharedFixture()
    const hostel = await roomFixture(f.students[0])
    await scanFixture(f.fa, f.students[0], { date: f.today, time: "00:01:00" })
    await scanFixture(f.fb, f.students[2], { date: f.today, time: "00:02:00" })
    await scanFixture(f.fb, f.students[2], { date: f.date, time: "00:03:00" })
    const api = await as(await office())
    const data = ok(await api.get(base + "/feed").query({ date: f.today }))
    expect(data.entries.map((e) => e.student.name)).toEqual(["Chen Three", "Asha One"])
    expect(data.entries[0].caterer).toMatchObject({ id: String(f.b.caterer._id), name: f.b.caterer.name })
    expect(data.entries[1].student).toMatchObject({ hostel: { id: String(hostel._id) }, room: { displayRoom: "A-101" } })
    const filtered = ok(await api.get(base + "/feed").query({ date: f.today, catererId: String(f.a.caterer._id) }))
    expect(filtered.entries.map((e) => e.student.name)).toEqual(["Asha One"])
    const lunch = ok(await api.get(base + "/feed").query({ date: f.today, mealSlotKey: "lunch" }))
    expect(lunch.entries).toEqual([])
    expect((await api.get(base + "/feed").query({ limit: "101" })).status).toBe(400)
  })

  it("caterer logins keep seeing only their own kitchen on /dining-caterer", async () => {
    const f = await sharedFixture()
    await scanFixture(f.fb, f.students[2])
    const data = ok(await (await as(f.a.user)).get("/api/v1/dining-caterer/meal-records").query(mealQuery(f, { catererId: String(f.b.caterer._id) })))
    expect(data.caterer).toMatchObject({ id: String(f.a.caterer._id) })
    expect(data.caterers).toBeUndefined()
    expect(data.students.every((row) => row.caterer === undefined)).toBe(true)
    expect(data.summary).toMatchObject({ allocatedCount: 2, verifiedCount: 0 })
  })
})

describe("dining insights — dining office", () => {
  it("the office can read the insights overview; caterer logins cannot", async () => {
    ok(await (await as(await office())).get("/api/v1/dining-insights/overview"))
    const { user } = await catererFixture()
    expect((await (await as(user)).get("/api/v1/dining-insights/overview")).status).toBe(403)
  })
})

describe("admin dining pages — dining office", () => {
  const pages = ["/caterers", "/dining-periods", "/dining-rebates", "/dining-billing-periods"]
  it.each(pages)("the office can open %s; caterer logins cannot", async (route) => {
    expect((await (await as(await office())).get("/api/v1/admin" + route)).status).toBe(200)
    const { user } = await catererFixture()
    expect((await (await as(user)).get("/api/v1/admin" + route)).status).toBe(403)
  })
  it("the office can read a period's allocations", async () => {
    const f = await sharedFixture()
    expect((await (await as(await office())).get(`/api/v1/admin/dining-periods/${f.period._id}/allocations`)).status).toBe(200)
  })
  it("the rest of the admin API stays admin-only", async () => {
    const api = await as(await office())
    expect((await api.get("/api/v1/admin/dining-office")).status).toBe(403)
    expect((await api.get("/api/v1/admin/wardens")).status).toBe(403)
  })
})
