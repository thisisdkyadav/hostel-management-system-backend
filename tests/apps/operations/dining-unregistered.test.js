/**
 * Unregistered (auto-allocated) dining students (temp/dining-unregistered-contract.md):
 * the auto-allocation job marks the rows it creates `unregistered`; those
 * students can't request NEW rebates touching that period (earlier rebates keep
 * counting and stay approvable) until Admin / Dining Office clears the mark.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  utcDay,
  dayKey,
  createStudentProfile,
  createCaterer,
  createDiningPeriod,
  createDiningAllocation,
  archiveLiveDiningPeriods,
} from "../../helpers/seed/students.js"
import { catererFixture } from "../../helpers/seed/dining-caterer.js"
import { DiningAllocation, DiningRebate } from "../../../src/models/index.js"
import { runDueDiningAutoAllocations } from "../../../src/apps/administration/modules/admin/dining-auto-allocation.service.js"
import { allocationOwner } from "../../../src/services/dining/allocationOwner.service.js"
import { getApprovedRebateStudentIdsForDay } from "../../../src/services/dining/dining-rebate.service.js"

const STUDENT = "/api/v1/students/dining"
const ADMIN = "/api/v1/admin"
const ALLOC = "/api/v1/dining-allocations"
const HOUR = 60 * 60 * 1000

const range = (from, to) => ({ startDate: dayKey(utcDay(from)), endDate: dayKey(utcDay(to)) })
const keys = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => dayKey(utcDay(from + i)))
const short = (offset) => utcDay(offset).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const blockedMessage = (from, to) => (
  `You were auto-allocated for the dining period ${short(from)} – ${short(to)} because you didn't choose a caterer, `
  + "so you can't request a rebate for those dates. Contact the dining office."
)

let rollSeq = 0
const newStudent = async () => {
  const user = await seed.student()
  const rollNumber = `UNREG${String(++rollSeq).padStart(3, "0")}`
  const profile = await createStudentProfile({ userId: user._id, rollNumber })
  return { user, profile, rollNumber, api: await as(user) }
}

let adminApi
let officeApi
let catererLogin
let catererB
let period // auto-allocated, +10..+30
let nextPeriod // registered for everyone, +31..+60
let self // chose a caterer before the job
let early // auto-allocated, had rebates before the job
let late // auto-allocated
let other // auto-allocated, never cleared
let pendingRebateId

beforeAll(async () => {
  await setupTestDb()
  await archiveLiveDiningPeriods()
  adminApi = await as(await seed.admin())
  officeApi = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
  const res = await adminApi.put("/api/v1/config/diningRebate").send({
    value: { shortTermMaxTotalDays: 10, shortTermMaxContinuousDays: 3, shortTermMinApplicationDays: 1, shortTermMinAdvanceDays: 2 },
  })
  expect(res.status).toBe(200)

  catererLogin = await catererFixture()
  catererB = await createCaterer({ name: "Unreg B Mess" })
  ;[self, early, late, other] = [await newStudent(), await newStudent(), await newStudent(), await newStudent()]

  const caterers = [catererLogin.caterer, catererB]
  period = await createDiningPeriod({
    startDate: utcDay(10),
    endDate: utcDay(30),
    registrationEnabled: false,
    allocationStartAt: null,
    allocationEndAt: null,
    catererIds: caterers.map((c) => c._id),
    catererCapacities: caterers.map((c) => ({ catererId: c._id, maxStudentCount: 50 })),
    eligibilityMode: "custom",
    eligibleRollNumbers: [self, early, late, other].map((s) => s.rollNumber),
    autoAllocationAt: new Date(Date.now() - HOUR),
  })
  nextPeriod = await createDiningPeriod({
    startDate: utcDay(31),
    endDate: utcDay(60),
    registrationEnabled: false,
    allocationStartAt: null,
    allocationEndAt: null,
    catererIds: [catererLogin.caterer._id],
    catererCapacities: [{ catererId: catererLogin.caterer._id, maxStudentCount: 50 }],
  })
  for (const s of [self, early, late, other]) {
    await createDiningAllocation({ periodId: nextPeriod._id, studentUserId: s.user._id, studentProfileId: s.profile._id, rollNumber: s.rollNumber, catererId: catererLogin.caterer._id })
  }

  // `self` chooses before the deadline.
  const chosen = await allocationOwner.assignStudent({
    periodId: period._id, studentUserId: self.user._id, studentProfileId: self.profile._id, rollNumber: self.rollNumber, catererId: catererLogin.caterer._id,
  })
  expect(chosen.ok).toBe(true)

  // `early` requests rebates before auto-allocation: one pending long-term, one approved short-term.
  const pending = await early.api.post(`${STUDENT}/rebates`).send(range(12, 16))
  expect(pending.status, JSON.stringify(pending.body)).toBe(201)
  expect(pending.body.data.rebates[0].status).toBe("pending")
  pendingRebateId = pending.body.data.rebates[0].id
  const approved = await early.api.post(`${STUDENT}/rebates`).send(range(20, 21))
  expect(approved.status, JSON.stringify(approved.body)).toBe(201)
  expect(approved.body.data.rebates[0].status).toBe("approved")

  const { results } = await runDueDiningAutoAllocations()
  const mine = results.find((r) => r.periodId === String(period._id))
  expect(mine).toMatchObject({ status: "completed", assigned: 3, leftOver: 0 })
})

afterAll(async () => {
  await teardownTestDb()
})

const rowOf = (s, p = period) => DiningAllocation.findOne({ periodId: p._id, studentUserId: s.user._id }).lean()

describe("auto-allocation marks rows unregistered", () => {
  it("marks the rows it creates and leaves self-selected rows alone", async () => {
    expect((await rowOf(self)).unregistered).toBe(false)
    for (const s of [early, late, other]) expect((await rowOf(s)).unregistered).toBe(true)
    expect((await rowOf(early, nextPeriod)).unregistered ?? false).toBe(false)
  })

  it("a manual move keeps the flag (both ways)", async () => {
    for (const s of [late, self]) {
      const before = await rowOf(s)
      const target = String(before.catererId) === String(catererB._id) ? catererLogin.caterer._id : catererB._id
      const res = await adminApi.post(`${ADMIN}/dining-periods/${period._id}/allocations`).send({ studentUserId: String(s.user._id), catererId: String(target) })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      expect(res.body.data.status).toBe("moved")
      const after = await rowOf(s)
      expect(String(after.catererId)).toBe(String(target))
      expect(after.unregistered).toBe(before.unregistered)
    }
    // An owner move with an explicit false arg never resets it either.
    const before = await rowOf(late)
    const target = String(before.catererId) === String(catererB._id) ? catererLogin.caterer._id : catererB._id
    const moved = await allocationOwner.assignStudent({
      periodId: period._id, studentUserId: late.user._id, studentProfileId: late.profile._id, rollNumber: late.rollNumber, catererId: target, unregistered: false,
    })
    expect(moved.status).toBe("moved")
    expect((await rowOf(late)).unregistered).toBe(true)
  })
})

describe("student rebates in an unregistered period", () => {
  it("preview and create are blocked with the same message", async () => {
    const message = blockedMessage(10, 30)
    const preview = await late.api.post(`${STUDENT}/rebates/preview`).send(range(22, 23))
    expect(preview.status).toBe(400)
    expect(preview.body.message).toBe(message)
    const create = await late.api.post(`${STUDENT}/rebates`).send(range(22, 23))
    expect(create.status).toBe(400)
    expect(create.body.message).toBe(message)
    expect(await DiningRebate.countDocuments({ studentUserId: late.user._id })).toBe(0)
  })

  it("a request crossing into a registered period is blocked as a whole", async () => {
    const res = await late.api.post(`${STUDENT}/rebates/preview`).send(range(29, 32))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(blockedMessage(10, 30))
    // Only the registered period: fine.
    const ok = await late.api.post(`${STUDENT}/rebates/preview`).send(range(33, 34))
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
  })

  it("a registered (self-selected) student is unaffected", async () => {
    const res = await self.api.post(`${STUDENT}/rebates/preview`).send(range(22, 23))
    expect(res.status, JSON.stringify(res.body)).toBe(200)
  })

  it("rules.unregisteredPeriods lists the blocked periods", async () => {
    const res = await late.api.get(`${STUDENT}/rebates`)
    expect(res.status).toBe(200)
    expect(res.body.data.rules.unregisteredPeriods).toEqual([
      { periodId: String(period._id), startDate: dayKey(utcDay(10)), endDate: dayKey(utcDay(30)) },
    ])
    const mine = await self.api.get(`${STUDENT}/rebates`)
    expect(mine.body.data.rules.unregisteredPeriods).toEqual([])
  })

  it("earlier rebates are untouched, still count and are still approvable", async () => {
    const rebates = await DiningRebate.find({ studentUserId: early.user._id }).lean()
    expect(rebates).toHaveLength(2)
    const approvedRow = rebates.find((r) => r.type === "short-term")
    expect(approvedRow.status).toBe("approved")

    const row = await rowOf(early)
    const counted = await getApprovedRebateStudentIdsForDay({ periodId: period._id, catererId: row.catererId, date: utcDay(20) })
    expect(counted.has(String(early.user._id))).toBe(true)

    const approve = await adminApi.put(`${ADMIN}/dining-rebates/${pendingRebateId}/approve`).send({})
    expect(approve.status, JSON.stringify(approve.body)).toBe(200)
    expect(approve.body.data.rebate.status).toBe("approved")
  })
})

describe("allocations roster + clearing the mark", () => {
  it("roster rows carry the flag; summary counts it; registration filters the list", async () => {
    const res = await officeApi.get(`${ALLOC}/roster`).query({ periodId: String(period._id) })
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const data = res.body.data
    expect(data.summary.unregisteredCount).toBe(3)
    const byId = new Map(data.students.map((s) => [s.id, s]))
    expect(byId.get(String(self.user._id))).toMatchObject({ unregistered: false, registrationClearedAt: null, registrationClearedBy: null })
    expect(byId.get(String(late.user._id)).unregistered).toBe(true)

    const unreg = await officeApi.get(`${ALLOC}/roster`).query({ periodId: String(period._id), registration: "unregistered" })
    expect(unreg.body.data.students.map((s) => s.id).sort()).toEqual([early, late, other].map((s) => String(s.user._id)).sort())
    expect(unreg.body.data.summary.unregisteredCount).toBe(3)
    const reg = await officeApi.get(`${ALLOC}/roster`).query({ periodId: String(period._id), registration: "registered" })
    expect(reg.body.data.students.map((s) => s.id)).toEqual([String(self.user._id)])
    const bad = await officeApi.get(`${ALLOC}/roster`).query({ periodId: String(period._id), registration: "maybe" })
    expect(bad.status).toBe(400)

    // Caterer logins see the flag read-only on their own kitchen.
    const mine = await (await as(catererLogin.user)).get(`${ALLOC}/roster`).query({ periodId: String(period._id) })
    expect(mine.status).toBe(200)
    expect(mine.body.data.students.every((s) => typeof s.unregistered === "boolean")).toBe(true)
  })

  it("caterer logins can't clear the mark", async () => {
    const res = await (await as(catererLogin.user)).put(`${ALLOC}/${period._id}/students/${late.user._id}/registered`)
    expect(res.status).toBe(403)
    expect((await rowOf(late)).unregistered).toBe(true)
  })

  it("404 without an allocation; 400 when not unregistered", async () => {
    const stranger = await newStudent()
    const missing = await adminApi.put(`${ALLOC}/${period._id}/students/${stranger.user._id}/registered`)
    expect(missing.status).toBe(404)
    const registered = await adminApi.put(`${ALLOC}/${period._id}/students/${self.user._id}/registered`)
    expect(registered.status).toBe(400)
  })

  it("Office clears it: roster row shape back, rebates allowed again", async () => {
    const res = await officeApi.put(`${ALLOC}/${period._id}/students/${late.user._id}/registered`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const { allocation } = res.body.data
    expect(allocation).toMatchObject({ id: String(late.user._id), unregistered: false })
    expect(allocation.registrationClearedAt).toBeTruthy()
    expect(allocation.registrationClearedBy).toMatchObject({ id: expect.any(String) })
    expect(typeof allocation.registrationClearedBy.name).toBe("string")
    expect(allocation.caterer).toBeTruthy()

    const again = await officeApi.put(`${ALLOC}/${period._id}/students/${late.user._id}/registered`)
    expect(again.status).toBe(400)

    const preview = await late.api.post(`${STUDENT}/rebates/preview`).send(range(22, 23))
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    const list = await late.api.get(`${STUDENT}/rebates`)
    expect(list.body.data.rules.unregisteredPeriods).toEqual([])

    const roster = await officeApi.get(`${ALLOC}/roster`).query({ periodId: String(period._id) })
    expect(roster.body.data.summary.unregisteredCount).toBe(2)
  })

  it("Admin can clear too", async () => {
    const res = await adminApi.put(`${ALLOC}/${period._id}/students/${early.user._id}/registered`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body.data.allocation.unregistered).toBe(false)
  })
})

describe("other serializations", () => {
  it("student history and the portal's allocation carry the flag", async () => {
    const history = await officeApi.get(`${ALLOC}/student-history`).query({ studentUserId: String(other.user._id) })
    expect(history.status).toBe(200)
    const entry = history.body.data.history.find((h) => h.periodId === String(period._id))
    expect(entry.unregistered).toBe(true)

    const portal = await other.api.get(`${STUDENT}/portal`)
    expect(portal.status, JSON.stringify(portal.body)).toBe(200)
    const upcoming = portal.body.data.allocatedUpcomingPeriod
    expect(String(upcoming.id || upcoming._id)).toBe(String(period._id))
    expect(upcoming.selectedAllocation.unregistered).toBe(true)
  })
})
