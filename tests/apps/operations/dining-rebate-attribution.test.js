/**
 * Standalone rebates: a rebate row carries no periodId/catererId. Its days count
 * for caterer C in period P only when the student is allocated to C in P and the
 * day lies inside P. Every backend reader must attribute rebates that way.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { catererFixture, periodFixture, studentFixture, removeAllocationFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"
import { DiningAllocation, DiningRebate } from "../../../src/models/index.js"
import { loadBillingPeriodAccounts } from "../../../src/apps/administration/modules/admin/dining-billing.service.js"
import { getBillingCycle, getBillingCycles } from "../../../src/apps/administration/modules/admin/dining-billing-cycles.service.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

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
const keysBetween = (from, to) => {
  const keys = []
  for (let key = from; key <= to; key = shift(key, 1)) keys.push(key)
  return keys
}
/** A new-style rebate: no periodId, no catererId (inserted raw so it never depends on schema requirements). */
const standaloneRebate = async (student, from, to, { status = "approved" } = {}) => {
  const dateKeys = keysBetween(from, to)
  const doc = {
    requestGroupId: new mongoose.Types.ObjectId().toString(),
    studentUserId: student.user._id, studentProfileId: student.profile._id, rollNumber: student.profile.rollNumber,
    startDate: new Date(`${from}T00:00:00Z`), endDate: new Date(`${to}T00:00:00Z`),
    dateKeys, dayCount: dateKeys.length, type: "short-term", status, reason: "Travel",
    createdAt: new Date(), updatedAt: new Date(),
  }
  const { insertedId } = await DiningRebate.collection.insertOne(doc)
  return { ...doc, _id: insertedId }
}

let s
beforeAll(async () => {
  const today = keyFor()
  const a = await catererFixture()
  const b = await catererFixture()
  const both = { catererIds: [a.caterer._id, b.caterer._id], dailyRate: 100 }
  // P1 = [today-10, today-1], P2 = [today, today+10]
  const p1 = await utcPeriod(a.caterer, shift(today, -10), shift(today, -1), both)
  const p2 = await utcPeriod(a.caterer, today, shift(today, 10), both)
  // Sam: caterer A in P1, caterer B in P2.
  const sam = await studentFixture(p1, a.caterer, "Sam Spanner", "S")
  await DiningAllocation.create({ periodId: p2._id, catererId: b.caterer._id, studentUserId: sam.user._id, studentProfileId: sam.profile._id, rollNumber: sam.profile.rollNumber })
  // Mia: caterer B in P1 (another kitchen); Uma: was at A in P1, unallocated.
  const mia = await studentFixture(p1, b.caterer, "Mia Mover", "M")
  const uma = await studentFixture(p1, a.caterer, "Uma Unallocated", "U")
  await removeAllocationFixture(uma)

  // Sam: today-2 .. today+1 (2 days in P1 at A, 2 days in P2 at B).
  const span = await standaloneRebate(sam, shift(today, -2), shift(today, 1))
  // Sam: days in no dining period at all.
  const outside = await standaloneRebate(sam, shift(today, -15), shift(today, -12))
  const miaRebate = await standaloneRebate(mia, shift(today, -2), shift(today, -2))
  const umaRebate = await standaloneRebate(uma, shift(today, -3), shift(today, -2))
  s = { today, a, b, p1, p2, sam, mia, uma, span, outside, miaRebate, umaRebate }
})

describe("caterer rebate calendar", () => {
  it("overview counts each rebate day for the caterer the student had that period", async () => {
    const { today, a, b } = s
    const from = shift(today, -3)
    const to = shift(today, 2)
    const forA = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates/overview").query({ from, to }))
    const forB = ok(await (await as(b.user)).get("/api/v1/dining-caterer/rebates/overview").query({ from, to }))
    const count = (data) => Object.fromEntries(data.days.map((day) => [day.date, day.onRebateCount]))
    // A: Sam on today-2/today-1 only (Uma is unallocated, Mia is at B).
    expect(count(forA)).toEqual({ [shift(today, -3)]: 0, [shift(today, -2)]: 1, [shift(today, -1)]: 1, [today]: 0, [shift(today, 1)]: 0, [shift(today, 2)]: 0 })
    // B: Mia on today-2 (P1), Sam on today/today+1 (P2).
    expect(count(forB)).toEqual({ [shift(today, -3)]: 0, [shift(today, -2)]: 1, [shift(today, -1)]: 0, [today]: 1, [shift(today, 1)]: 1, [shift(today, 2)]: 0 })
    // Sam returns on today+2 to B's kitchen.
    expect(forB.days.find((day) => day.date === shift(today, 2)).returningCount).toBe(1)
    expect(forA.days.find((day) => day.date === shift(today, 2)).returningCount).toBe(0)
  })

  it("day view serializes the rebate as its placement at this caterer", async () => {
    const { today, a, b, p1, p2, span } = s
    const dayA = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates/day").query({ date: shift(today, -1) }))
    expect(dayA.onRebateCount).toBe(1)
    const [entry] = dayA.onRebate
    expect(entry.rebate).toMatchObject({
      id: String(span._id), periodId: String(p1._id), catererId: String(a.caterer._id),
      period: { id: String(p1._id) }, caterer: { id: String(a.caterer._id), name: a.caterer.name },
      dateKeys: [shift(today, -2), shift(today, -1)], dayCount: 2,
    })
    expect(entry.rebate.placements).toHaveLength(1)
    // dayNumber/dayCount describe the whole trip.
    expect(entry).toMatchObject({ dayNumber: 2, dayCount: 4 })

    const dayB = ok(await (await as(b.user)).get("/api/v1/dining-caterer/rebates/day").query({ date: today }))
    expect(dayB.onRebate.map((item) => item.rebate.id)).toEqual([String(span._id)])
    expect(dayB.onRebate[0].rebate).toMatchObject({ periodId: String(p2._id), catererId: String(b.caterer._id), dateKeys: [today, shift(today, 1)], dayCount: 2 })
  })

  it("rebate list only holds rebates attributed to this caterer, placed for it", async () => {
    const { today, a, b, p1, p2, span, miaRebate, outside, umaRebate } = s
    const listA = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates"))
    expect(listA.rebates.map((rebate) => rebate.id)).toEqual([String(span._id)])
    expect(listA.counts).toMatchObject({ all: 1, approved: 1 })
    expect(listA.rebates[0]).toMatchObject({ periodId: String(p1._id), dayCount: 2, dateKeys: [shift(today, -2), shift(today, -1)] })

    const listB = ok(await (await as(b.user)).get("/api/v1/dining-caterer/rebates"))
    expect(listB.rebates.map((rebate) => rebate.id).sort()).toEqual([String(span._id), String(miaRebate._id)].sort())
    const samAtB = listB.rebates.find((rebate) => rebate.id === String(span._id))
    expect(samAtB).toMatchObject({ periodId: String(p2._id), catererId: String(b.caterer._id), dateKeys: [today, shift(today, 1)], dayCount: 2 })
    const ids = [...listA.rebates, ...listB.rebates].map((rebate) => rebate.id)
    expect(ids).not.toContain(String(outside._id))
    expect(ids).not.toContain(String(umaRebate._id))

    // Period filter + date window narrow the same attribution.
    const narrowed = ok(await (await as(b.user)).get("/api/v1/dining-caterer/rebates").query({ periodId: String(p2._id) }))
    expect(narrowed.rebates.map((rebate) => rebate.id)).toEqual([String(span._id)])
    const windowed = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates").query({ from: today }))
    expect(windowed.rebates).toEqual([])
  })
})

describe("meal records and daily report", () => {
  it("meal records count Sam away at A in P1 and at B in P2", async () => {
    const { today, a, b, p1, p2 } = s
    const overviewA = ok(await (await as(a.user)).get("/api/v1/dining-caterer/meal-records/overview").query({ periodId: String(p1._id), from: shift(today, -3), to: shift(today, -1) }))
    expect(overviewA.days.map((day) => day.onRebateCount)).toEqual([0, 1, 1])
    const recordB = ok(await (await as(b.user)).get("/api/v1/dining-caterer/meal-records").query({ periodId: String(p2._id), date: today, mealSlotKey: "all-day" }))
    expect(recordB.summary.onRebateCount).toBe(1)
    expect(recordB.students.find((row) => row.student.rollNumber === s.sam.profile.rollNumber).status).toBe("on-rebate")
  })

  it("daily report attributes per period", async () => {
    const { today, a, b, p1, p2 } = s
    const api = await as(await office())
    const rowOf = (data, caterer) => data.caterers.find((row) => row.id === String(caterer._id))
    const before = ok(await api.get("/api/v1/dining-oversight/daily-report").query({ date: shift(today, -2), periodId: String(p1._id) }))
    expect(rowOf(before, a.caterer).onRebateCount).toBe(1) // Sam (Uma unallocated)
    expect(rowOf(before, b.caterer).onRebateCount).toBe(1) // Mia
    const now = ok(await api.get("/api/v1/dining-oversight/daily-report").query({ date: today, periodId: String(p2._id) }))
    expect(rowOf(now, a.caterer).onRebateCount).toBe(0)
    expect(rowOf(now, b.caterer).onRebateCount).toBe(1) // Sam
  })
})

describe("allocation roster", () => {
  it("rebate figures are the student's rebate days inside the period", async () => {
    const { today, p1, p2, sam } = s
    const api = await as(await office())
    const r1 = ok(await api.get("/api/v1/dining-allocations/roster").query({ periodId: String(p1._id) }))
    const sam1 = r1.students.find((row) => row.rollNumber === sam.profile.rollNumber)
    expect(sam1).toMatchObject({ approvedRebateDays: 2, rebateDays: 2 })
    expect(r1.students.find((row) => row.rollNumber === s.uma.profile.rollNumber)).toBeUndefined()
    const r2 = ok(await api.get("/api/v1/dining-allocations/roster").query({ periodId: String(p2._id) }))
    const sam2 = r2.students.find((row) => row.rollNumber === sam.profile.rollNumber)
    expect(sam2).toMatchObject({ approvedRebateDays: 2, onRebateToday: true })
    expect(today).toBeTruthy()
  })
})

describe("billing", () => {
  it("charges subtract approved rebate days inside each allocated period only", async () => {
    const { p1, p2, sam, mia, uma } = s
    const { accounts } = await loadBillingPeriodAccounts({ _id: new mongoose.Types.ObjectId(), diningPeriodIds: [p1.toObject(), p2.toObject()] })
    const samAccount = accounts.find((row) => row.studentUserId === String(sam.user._id))
    const byPeriod = Object.fromEntries(samAccount.perPeriod.map((row) => [row.periodId, row]))
    // P1: 10 elapsed days, 2 rebate days (the 4 days outside every period are ignored).
    expect(byPeriod[String(p1._id)]).toMatchObject({ totalDays: 10, rebateDays: 2, chargeableDays: 8, amount: 800 })
    // P2: only today has elapsed; it is a rebate day.
    expect(byPeriod[String(p2._id)]).toMatchObject({ totalDays: 1, rebateDays: 1, chargeableDays: 0 })
    const miaAccount = accounts.find((row) => row.studentUserId === String(mia.user._id))
    expect(miaAccount.perPeriod).toMatchObject([{ periodId: String(p1._id), rebateDays: 1 }])
    // Uma is not allocated anywhere: her rebate has no account to land in.
    expect(accounts.find((row) => row.studentUserId === String(uma.user._id))).toBeUndefined()
  })

  it("billing cycles count rebates by attribution and clip them to the period", async () => {
    const { p1, p2, sam } = s
    const cycles = (await getBillingCycles()).data
    const c1 = cycles.find((row) => row.id === String(p1._id))
    const c2 = cycles.find((row) => row.id === String(p2._id))
    // P1: Sam (2 days) + Mia (1 day); Uma unallocated, Sam's out-of-period rebate ignored.
    expect(c1.rebates).toMatchObject({ approved: 2, pending: 0, approvedDays: 3, elapsedDays: 3, students: 2 })
    expect(c2.rebates).toMatchObject({ approved: 1, approvedDays: 2, students: 1 })
    const detail = (await getBillingCycle(String(p1._id))).data
    const samRow = detail.students.find((row) => row.studentUserId === String(sam.user._id))
    expect(samRow).toMatchObject({ approvedRebateDays: 2, rebateDays: 2, chargeableDays: 8 })
  })
})
