/**
 * Rebates beyond the student's registered period (temp/dining-rebate-registration-risk-contract.md):
 *  - preview reports `atRiskDayCount` (days in no period, or in a period with no
 *    allocation yet) and `requiresRegistrationAcknowledgement`; placements carry `registered`;
 *  - create needs `acknowledgeRegistration: true` for an at-risk request and
 *    stores `registrationAcknowledgedAt`;
 *  - an `unregistered` allocation contributes NO rebate days anywhere (caterer
 *    pages, meal records, daily report, roster, office dashboard, insights,
 *    billing, student meals/bill, digest, meal verification); clearing the
 *    mark brings them back; placements carry `counted`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { catererFixture, periodFixture, studentFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"
import { DiningAllocation, DiningBillingPeriod, DiningRebate } from "../../../src/models/index.js"
import { loadBillingPeriodAccounts } from "../../../src/apps/administration/modules/admin/dining-billing.service.js"
import { getBillingCycle, getBillingCycles } from "../../../src/apps/administration/modules/admin/dining-billing-cycles.service.js"
import { getApprovedRebateStudentIdsForDay } from "../../../src/services/dining/dining-rebate.service.js"
import { findStudentsWhoMissedMeals } from "../../../src/apps/operations/modules/dining-caterer/dining-missed-meals-digest.service.js"

const STUDENT = "/api/v1/students/dining"
const ACK_MESSAGE = "Please confirm that you will register for the upcoming dining periods covered by this rebate."

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
const setUnregistered = (student, period, value) => DiningAllocation.updateOne(
  { periodId: period._id, studentUserId: student.user._id }, { $set: { unregistered: value } },
)

let s
beforeAll(async () => {
  const adminApi = await as(await seed.admin())
  const rules = await adminApi.put("/api/v1/config/diningRebate").send({
    value: { shortTermMaxTotalDays: 10, shortTermMaxContinuousDays: 5, shortTermMinApplicationDays: 1, shortTermMinAdvanceDays: 2 },
  })
  expect(rules.status).toBe(200)

  const today = keyFor()
  const a = await catererFixture()
  const extra = { catererIds: [a.caterer._id], dailyRate: 100 }
  // Past + current periods (enforcement). P1 = [today-10, today-1], P2 = [today, today+10].
  const p1 = await utcPeriod(a.caterer, shift(today, -10), shift(today, -1), extra)
  const p2 = await utcPeriod(a.caterer, today, shift(today, 10), extra)
  // Future periods (preview/create). F1 has Rae's allocation, F2 has none; +41.. is in no period.
  const f1 = await utcPeriod(a.caterer, shift(today, 20), shift(today, 30), extra)
  const f2 = await utcPeriod(a.caterer, shift(today, 31), shift(today, 38), extra)

  // Sam: allocated at A in P1 and P2; approved rebate today-2 .. today+1 (2 days each).
  const sam = await studentFixture(p1, a.caterer, "Sam Spanner", "S")
  await DiningAllocation.create({ periodId: p2._id, catererId: a.caterer._id, studentUserId: sam.user._id, studentProfileId: sam.profile._id, rollNumber: sam.profile.rollNumber })
  const span = await standaloneRebate(sam, shift(today, -2), shift(today, 1))
  // Allocated since P1 began (the digest only expects meals after the allocation existed).
  await DiningAllocation.collection.updateOne({ periodId: p1._id, studentUserId: sam.user._id }, { $set: { createdAt: new Date(`${shift(today, -10)}T00:00:00Z`) } })

  // Rae: allocated in F1 only (portal requests).
  const rae = await studentFixture(f1, a.caterer, "Rae Request", "R")
  rae.api = await as(rae.user)
  s = { today, a, p1, p2, f1, f2, sam, span, rae, adminApi }
})

describe("preview: at-risk days + registered placements", () => {
  it("a fully secured request (registered period) needs no acknowledgement", async () => {
    const { today, rae, f1 } = s
    const data = ok(await rae.api.post(`${STUDENT}/rebates/preview`).send({ startDate: shift(today, 22), endDate: shift(today, 23) }))
    expect(data).toMatchObject({ unplacedDayCount: 0, atRiskDayCount: 0, requiresRegistrationAcknowledgement: false })
    expect(data.placements).toEqual([expect.objectContaining({ periodId: String(f1._id), registered: true, dayCount: 2 })])

    const created = await rae.api.post(`${STUDENT}/rebates`).send({ startDate: shift(today, 22), endDate: shift(today, 23), reason: "Secured" })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body.data.rebates[0].registrationAcknowledgedAt).toBeNull()
    expect(created.body.data.rebates[0].placements).toEqual([expect.objectContaining({ periodId: String(f1._id), counted: true })])
  })

  it("counts days in a period without allocation and days in no period", async () => {
    const { today, rae, f1, f2 } = s
    // +29..+30 in F1 (registered), +31..+38 in F2 (no allocation: 8), +39..+42 in no period (4).
    const data = ok(await rae.api.post(`${STUDENT}/rebates/preview`).send({ startDate: shift(today, 29), endDate: shift(today, 42) }))
    expect(data).toMatchObject({ dayCount: 14, unplacedDayCount: 4, atRiskDayCount: 12, requiresRegistrationAcknowledgement: true })
    expect(data.placements).toEqual([
      expect.objectContaining({ periodId: String(f1._id), registered: true, dayCount: 2 }),
      expect.objectContaining({ periodId: String(f2._id), registered: false, caterer: null, dayCount: 8 }),
    ])

    const unplaced = ok(await rae.api.post(`${STUDENT}/rebates/preview`).send({ startDate: shift(today, 50), endDate: shift(today, 51) }))
    expect(unplaced).toMatchObject({ placements: [], unplacedDayCount: 2, atRiskDayCount: 2, requiresRegistrationAcknowledgement: true })
  })
})

describe("create: acknowledgement", () => {
  it("400s an at-risk request without the flag (non-true values too), saves nothing", async () => {
    const { today, rae } = s
    const before = await DiningRebate.countDocuments({ studentUserId: rae.user._id })
    for (const acknowledgeRegistration of [undefined, false, "true", 1]) {
      const res = await rae.api.post(`${STUDENT}/rebates`).send({ startDate: shift(today, 50), endDate: shift(today, 51), reason: "Trip", acknowledgeRegistration })
      expect(res.status).toBe(400)
      expect(res.body.message).toBe(ACK_MESSAGE)
    }
    expect(await DiningRebate.countDocuments({ studentUserId: rae.user._id })).toBe(before)
  })

  it("accepts it with acknowledgeRegistration: true and stores registrationAcknowledgedAt", async () => {
    const { today, rae, f2 } = s
    const res = await rae.api.post(`${STUDENT}/rebates`).send({ startDate: shift(today, 33), endDate: shift(today, 34), reason: "Trip", acknowledgeRegistration: true })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    const [created] = res.body.data.rebates
    expect(created.registrationAcknowledgedAt).toBeTruthy()
    expect(created.placements).toEqual([expect.objectContaining({ periodId: String(f2._id), caterer: null, counted: true })])
    const row = await DiningRebate.findById(created.id).lean()
    expect(row.registrationAcknowledgedAt).toBeInstanceOf(Date)

    // Serialized for the student list and the admin list.
    const mine = ok(await rae.api.get(`${STUDENT}/rebates`)).rebates.find((rebate) => rebate.id === created.id)
    expect(mine.registrationAcknowledgedAt).toBeTruthy()
    const admin = ok(await s.adminApi.get("/api/v1/admin/dining-rebates")).rebates.find((rebate) => rebate.id === created.id)
    expect(admin.registrationAcknowledgedAt).toBeTruthy()
  })
})

const catererCounts = async () => {
  const { today, a } = s
  const data = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates/overview").query({ from: shift(today, -2), to: shift(today, 1) }))
  return data.days.map((day) => day.onRebateCount)
}

describe("enforcement: unregistered allocations attribute no rebate days", () => {
  it("baseline: Sam's rebate counts in P1 and P2", async () => {
    expect(await catererCounts()).toEqual([1, 1, 1, 1])
  })

  it("marking P1 unregistered drops its days everywhere; P2 keeps counting", async () => {
    const { today, a, p1, p2, sam, span } = s
    await setUnregistered(sam, p1, true)

    // Caterer rebate calendar + list.
    expect(await catererCounts()).toEqual([0, 0, 1, 1])
    const list = ok(await (await as(a.user)).get("/api/v1/dining-caterer/rebates").query({ periodId: String(p1._id) }))
    expect(list.rebates).toEqual([])

    // Meal records + daily report.
    const records = ok(await (await as(a.user)).get("/api/v1/dining-caterer/meal-records/overview").query({ periodId: String(p1._id), from: shift(today, -2), to: shift(today, -1) }))
    expect(records.days.map((day) => day.onRebateCount)).toEqual([0, 0])
    expect(records.days.map((day) => day.expectedCount)).toEqual([1, 1])
    const officeApi = await as(await office())
    const report = ok(await officeApi.get("/api/v1/dining-oversight/daily-report").query({ date: shift(today, -2), periodId: String(p1._id) }))
    expect(report.caterers.find((row) => row.id === String(a.caterer._id)).onRebateCount).toBe(0)

    // Allocations roster.
    const roster = ok(await officeApi.get("/api/v1/dining-allocations/roster").query({ periodId: String(p1._id) }))
    expect(roster.students.find((row) => row.rollNumber === sam.profile.rollNumber)).toMatchObject({ approvedRebateDays: 0, rebateDays: 0, unregistered: true })

    // Billing (admin accounts + cycles).
    const { accounts } = await loadBillingPeriodAccounts({ _id: new mongoose.Types.ObjectId(), diningPeriodIds: [p1.toObject(), p2.toObject()] })
    const byPeriod = Object.fromEntries(accounts.find((row) => row.studentUserId === String(sam.user._id)).perPeriod.map((row) => [row.periodId, row]))
    expect(byPeriod[String(p1._id)]).toMatchObject({ totalDays: 10, rebateDays: 0, chargeableDays: 10 })
    expect(byPeriod[String(p2._id)]).toMatchObject({ rebateDays: 1 })
    const cycle = (await getBillingCycles()).data.find((row) => row.id === String(p1._id))
    expect(cycle.rebates).toMatchObject({ approved: 0, approvedDays: 0 })
    const detail = (await getBillingCycle(String(p1._id))).data.students.find((row) => row.studentUserId === String(sam.user._id))
    expect(detail).toMatchObject({ approvedRebateDays: 0, rebateDays: 0, chargeableDays: 10 })

    // Meal verification attribution + the digest (yesterday was a rebate day, now expected).
    const away = await getApprovedRebateStudentIdsForDay({ periodId: p1._id, catererId: a.caterer._id, date: new Date(`${shift(today, -1)}T00:00:00Z`) })
    expect(away.has(String(sam.user._id))).toBe(false)
    const missed = await findStudentsWhoMissedMeals(shift(today, -1))
    expect(missed.map((row) => row.student.rollNumber)).toContain(sam.profile.rollNumber)

    // Placements: not counted in P1, counted in P2.
    const samApi = await as(sam.user)
    const mine = ok(await samApi.get(`${STUDENT}/rebates`)).rebates.find((rebate) => rebate.id === String(span._id))
    expect(mine.placements).toEqual([
      expect.objectContaining({ periodId: String(p1._id), counted: false }),
      expect.objectContaining({ periodId: String(p2._id), counted: true }),
    ])
    const admin = ok(await s.adminApi.get("/api/v1/admin/dining-rebates")).rebates.find((rebate) => rebate.id === String(span._id))
    expect(admin.placements.map((placement) => placement.counted)).toEqual([false, true])
  })

  it("marking the current period unregistered drops today's rebate from meals, bill, dashboard and insights", async () => {
    const { today, p1, p2, sam } = s
    await setUnregistered(sam, p2, true)
    const samApi = await as(sam.user)

    const meals = ok(await samApi.get(`${STUDENT}/meals`))
    expect(meals.days.find((day) => day.date === today)).toMatchObject({ away: false, awayPending: false })

    const billing = await DiningBillingPeriod.create({ name: "Risk term", diningPeriodIds: [p1._id, p2._id] })
    const bill = ok(await samApi.get(`${STUDENT}/billing`)).billingPeriods.find((row) => row.id === String(billing._id))
    expect(bill.perPeriod.every((row) => row.rebateDays === 0)).toBe(true)

    const dashboard = ok(await (await as(await office())).get("/api/v1/dining-office/dashboard"))
    expect(dashboard.today.onRebate).toBe(0)
    const insights = ok(await s.adminApi.get("/api/v1/dining-insights/overview"))
    expect(insights.totals.todayOnRebate).toBe(0)
    expect(await catererCounts()).toEqual([0, 0, 0, 0])
  })

  it("clearing the marks (Mark as registered) brings the days back", async () => {
    const { today, a, p1, p2, sam, span } = s
    for (const period of [p1, p2]) {
      const res = await s.adminApi.put(`/api/v1/dining-allocations/${period._id}/students/${sam.user._id}/registered`)
      expect(res.status, JSON.stringify(res.body)).toBe(200)
    }
    expect(await catererCounts()).toEqual([1, 1, 1, 1])

    const samApi = await as(sam.user)
    expect(ok(await samApi.get(`${STUDENT}/meals`)).days.find((day) => day.date === today).away).toBe(true)
    const bill = ok(await samApi.get(`${STUDENT}/billing`)).billingPeriods[0]
    expect(Object.fromEntries(bill.perPeriod.map((row) => [row.periodId, row.rebateDays]))).toEqual({ [String(p1._id)]: 2, [String(p2._id)]: 1 })
    expect(ok(await (await as(await office())).get("/api/v1/dining-office/dashboard")).today.onRebate).toBe(1)
    expect(ok(await s.adminApi.get("/api/v1/dining-insights/overview")).totals.todayOnRebate).toBe(1)

    const away = await getApprovedRebateStudentIdsForDay({ periodId: p1._id, catererId: a.caterer._id, date: new Date(`${shift(today, -1)}T00:00:00Z`) })
    expect(away.has(String(sam.user._id))).toBe(true)
    const detail = (await getBillingCycle(String(p1._id))).data.students.find((row) => row.studentUserId === String(sam.user._id))
    expect(detail).toMatchObject({ approvedRebateDays: 2, chargeableDays: 8 })
    expect((await findStudentsWhoMissedMeals(shift(today, -1))).map((row) => row.student.rollNumber)).not.toContain(sam.profile.rollNumber)
    const mine = ok(await samApi.get(`${STUDENT}/rebates`)).rebates.find((rebate) => rebate.id === String(span._id))
    expect(mine.placements.map((placement) => placement.counted)).toEqual([true, true])
  })
})
