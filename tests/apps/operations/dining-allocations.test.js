import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { catererFixture, periodFixture, studentFixture, scanFixture, rebateFixture, roomFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/dining-allocations"
const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const office = () => seed.createUser({ role: "Dining", subRole: "Office" })
// Real periods store calendar days as UTC midnight.
const utcPeriod = (caterer, from, to, extra = {}) => periodFixture(caterer, from, to, {
  startDate: new Date(`${from}T00:00:00Z`), endDate: new Date(`${to}T00:00:00Z`), ...extra,
})

/** One current period with two kitchens: three students at A, one at B. */
const twoKitchens = async () => {
  const today = keyFor()
  const a = await catererFixture()
  const b = await catererFixture()
  const period = await utcPeriod(a.caterer, shift(today, -4), shift(today, 5), {
    catererIds: [a.caterer._id, b.caterer._id],
    catererCapacities: [{ catererId: a.caterer._id, maxStudentCount: 10 }, { catererId: b.caterer._id, maxStudentCount: 5 }],
    dailyRate: 100,
    eligibleStudentCount: 8,
  })
  const students = []
  for (const [name, prefix] of [["Alpha Student", "A"], ["Beta Student", "B"], ["Gamma Student", "C"]]) {
    students.push(await studentFixture(period, a.caterer, name, prefix))
  }
  const other = await studentFixture(period, b.caterer, "Delta Student", "D")
  return { today, a, b, period, students, other, f: { period, caterer: a.caterer, date: today } }
}

describe("dining allocations — authorization", () => {
  it.each(["/periods", "/roster", "/student-history"])("requires a session: %s", async (route) => {
    expect((await (await anon()).get(base + route)).status).toBe(401)
  })
  it("rejects students and enforces each portal's route key", async () => {
    expect((await (await as(await seed.student())).get(base + "/periods")).status).toBe(403)
    const { user } = await catererFixture({ authz: { override: { denyRoutes: ["route.caterer.students"] } } })
    expect((await (await as(user)).get(base + "/periods")).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningAllocations"] } } })
    expect((await (await as(denied)).get(base + "/periods")).status).toBe(403)
    // The admin key does not open the caterer portal's view.
    const caterer = await catererFixture({ authz: { override: { allowRoutes: ["route.admin.diningAllocations"], denyRoutes: ["route.caterer.students"] } } })
    expect((await (await as(caterer.user)).get(base + "/periods")).status).toBe(403)
  })
  it("grants Admin, Office and Caterer by default", async () => {
    const { user } = await catererFixture()
    ok(await (await as(user)).get(base + "/periods"))
    ok(await (await as(await office())).get(base + "/periods"))
    ok(await (await as(await seed.admin())).get(base + "/periods"))
  })
})

describe("dining allocations — periods", () => {
  it("defaults to the current period; caterers see only their kitchen's seats", async () => {
    const { today, a, period } = await twoKitchens()
    const past = await utcPeriod(a.caterer, shift(today, -40), shift(today, -10))
    const future = await utcPeriod(a.caterer, shift(today, 20), shift(today, 40), { registrationEnabled: false })

    const mine = ok(await (await as(a.user)).get(base + "/periods"))
    expect(mine.defaultPeriodId).toBe(String(period._id))
    expect(mine.caterers).toBeUndefined()
    expect(mine.periods.map((item) => item.id)).toEqual([future, period, past].map((item) => String(item._id)))
    expect(mine.periods.map((item) => item.phase)).toEqual(["upcoming", "current", "past"])
    expect(mine.periods[1]).toMatchObject({ allocated: 3, capacity: 10, totalDays: 10, elapsedDays: 5, dailyRate: 100 })
    expect(mine.periods[1].caterers).toEqual([{ id: String(a.caterer._id), name: a.caterer.name, allocated: 3, capacity: 10 }])
    expect(mine.periods[1].eligible).toBeUndefined()
    expect(mine.periods[0]).toMatchObject({ registrationEnabled: false, elapsedDays: 0 })

    const all = ok(await (await as(await office())).get(base + "/periods"))
    const current = all.periods.find((item) => item.id === String(period._id))
    expect(current).toMatchObject({ allocated: 4, capacity: 15, eligible: 8 })
    expect(current.caterers).toHaveLength(2)
    expect(all.caterers.length).toBeGreaterThanOrEqual(2)
  })
  it("falls back to the soonest upcoming period when none is running", async () => {
    const { user, caterer } = await catererFixture()
    const today = keyFor()
    const later = await utcPeriod(caterer, shift(today, 60), shift(today, 70))
    const sooner = await utcPeriod(caterer, shift(today, 10), shift(today, 20))
    await utcPeriod(caterer, shift(today, -30), shift(today, -20))
    expect(later).toBeTruthy()
    expect(ok(await (await as(user)).get(base + "/periods")).defaultPeriodId).toBe(String(sooner._id))
  })
})

describe("dining allocations — roster", () => {
  it("returns photo, room, meals, rebates and billable days; caterers get no fee or eligibility", async () => {
    const { today, a, period, students, f } = await twoKitchens()
    const [alpha, beta, gamma] = students
    await roomFixture(alpha)
    await scanFixture(f, alpha, { date: today })
    await scanFixture(f, alpha, { date: shift(today, -1), mealSlotKey: "lunch" })
    await scanFixture(f, alpha, { date: shift(today, -1), status: "duplicate" })
    await rebateFixture(f, beta, { from: shift(today, -1), to: shift(today, 1) })
    await rebateFixture(f, gamma, { status: "pending" })

    const data = ok(await (await as(a.user)).get(base + "/roster").query({ periodId: String(period._id) }))
    expect(data.scope).toMatchObject({ oversight: false, caterer: { id: String(a.caterer._id) } })
    expect(data.period).toMatchObject({ phase: "current", totalDays: 10, elapsedDays: 5, dailyRate: 100 })
    expect(data.period.eligible).toBeUndefined()
    expect(data.students.map((row) => row.name)).toEqual(["Alpha Student", "Beta Student", "Gamma Student"])
    expect(data.students[0]).toMatchObject({
      name: "Alpha Student", profileImage: expect.stringMatching(/^media:\/\//), room: { displayRoom: "A-101" },
      caterer: { id: String(a.caterer._id), name: a.caterer.name },
      meals: 2, daysEaten: 2, ateToday: true, mealsOffered: 10, attendance: 20, chargeableDays: 5, billed: 500,
    })
    expect(data.students[0].fee).toBeUndefined()
    // Beta: rebate yesterday + today elapsed, tomorrow still ahead.
    expect(data.students[1]).toMatchObject({ meals: 0, onRebateToday: true, rebateDays: 2, approvedRebateDays: 3, chargeableDays: 3, billed: 300, mealsOffered: 6 })
    expect(data.students[2]).toMatchObject({ pendingRebates: 1, chargeableDays: 5 })
    expect(data.summary).toMatchObject({
      allocated: 3, capacity: 10, ateToday: 1, onRebateToday: 1, neverAte: 2, meals: 2,
      rebateDays: 2, pendingRebates: 1, billedDays: 13, billedAmount: 1300,
      // Remaining 5 days x 3 students, less Beta's one future rebate day.
      projectedAmount: (13 + 15 - 1) * 100, fee: null,
    })
    expect(data.summary.notChosen).toBeUndefined()
  })
  it("Admin and Office see every kitchen, can narrow to one, and get eligibility", async () => {
    const { b, period } = await twoKitchens()
    const api = await as(await seed.admin())
    const all = ok(await api.get(base + "/roster").query({ periodId: String(period._id) }))
    expect(all.students).toHaveLength(4)
    expect(all.caterers).toHaveLength(2)
    expect(all.summary).toMatchObject({ allocated: 4, capacity: 15, notChosen: 4 })
    expect(all.students[0]).toHaveProperty("fee", null)
    const one = ok(await (await as(await office())).get(base + "/roster").query({ periodId: String(period._id), catererId: String(b.caterer._id) }))
    expect(one.students.map((row) => row.name)).toEqual(["Delta Student"])
    expect(one.caterers).toEqual([{ id: String(b.caterer._id), name: b.caterer.name, allocated: 1, capacity: 5 }])
  })
  it("upcoming periods bill nothing yet but project the full period", async () => {
    const { user, caterer } = await catererFixture()
    const today = keyFor()
    const period = await utcPeriod(caterer, shift(today, 10), shift(today, 19), { dailyRate: 50 })
    await studentFixture(period, caterer, "Early Bird", "E")
    const data = ok(await (await as(user)).get(base + "/roster").query({ periodId: String(period._id) }))
    expect(data.period).toMatchObject({ phase: "upcoming", elapsedDays: 0 })
    expect(data.students[0]).toMatchObject({ meals: 0, chargeableDays: 0, attendance: null })
    expect(data.summary).toMatchObject({ billedAmount: 0, projectedAmount: 500, neverAte: 0 })
  })
  it("validates the period and keeps caterers out of other kitchens' periods", async () => {
    const { b, period } = await twoKitchens()
    const stranger = await catererFixture()
    const api = await as(stranger.user)
    expect((await api.get(base + "/roster")).status).toBe(400)
    expect((await api.get(base + "/roster").query({ periodId: "nope" })).status).toBe(400)
    expect((await api.get(base + "/roster").query({ periodId: String(period._id) })).status).toBe(400)
    // A caterer cannot widen its scope with ?catererId.
    const data = ok(await (await as(b.user)).get(base + "/roster").query({ periodId: String(period._id), catererId: String(stranger.caterer._id) }))
    expect(data.students.map((row) => row.name)).toEqual(["Delta Student"])
  })
  it("returns an empty roster for a period with no allocations", async () => {
    const { user, caterer } = await catererFixture()
    const today = keyFor()
    const period = await utcPeriod(caterer, shift(today, -2), shift(today, 2))
    const data = ok(await (await as(user)).get(base + "/roster").query({ periodId: String(period._id) }))
    expect(data.students).toEqual([])
    expect(data.summary).toMatchObject({ allocated: 0, attendance: null, billedAmount: 0 })
  })
})

describe("dining allocations — student history", () => {
  it("lists a student's periods newest first; caterers see only their own kitchen's", async () => {
    const { today, a, b, period } = await twoKitchens()
    const old = await utcPeriod(b.caterer, shift(today, -60), shift(today, -30))
    const student = await studentFixture(old, b.caterer, "Mover", "M")
    // Same student, now at kitchen A in the current period.
    const { DiningAllocation } = await import("../../../src/models/index.js")
    await DiningAllocation.create({ periodId: period._id, catererId: a.caterer._id, studentUserId: student.user._id, studentProfileId: student.profile._id, rollNumber: student.profile.rollNumber })

    const query = { studentUserId: String(student.user._id) }
    const all = ok(await (await as(await seed.admin())).get(base + "/student-history").query(query))
    expect(all.history.map((row) => [row.periodId, row.phase, row.caterer.id])).toEqual([
      [String(period._id), "current", String(a.caterer._id)],
      [String(old._id), "past", String(b.caterer._id)],
    ])
    const mine = ok(await (await as(a.user)).get(base + "/student-history").query(query))
    expect(mine.history.map((row) => row.periodId)).toEqual([String(period._id)])
    expect((await (await as(a.user)).get(base + "/student-history").query({ studentUserId: "x" })).status).toBe(400)
  })
})
