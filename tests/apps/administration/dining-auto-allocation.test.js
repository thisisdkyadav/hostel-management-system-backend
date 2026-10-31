/**
 * Scheduled dining auto-allocation.
 *
 * Part 1: admin dining-period validation / edit rules for `autoAllocationAt`
 * (API level). Part 2: the job (`runDueDiningAutoAllocations`) against
 * periods seeded with a due time. Part 3: how results surface on the
 * dining-allocations and student portal endpoints.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  utcDay,
  createStudentProfile,
  createCaterer,
  createDiningPeriod,
  archiveLiveDiningPeriods,
} from "../../helpers/seed/students.js"
import { catererFixture } from "../../helpers/seed/dining-caterer.js"
import { DiningPeriod, DiningAllocation } from "../../../src/models/index.js"
import { runDueDiningAutoAllocations } from "../../../src/apps/administration/modules/admin/dining-auto-allocation.service.js"
import { allocationOwner } from "../../../src/services/dining/allocationOwner.service.js"

const ADMIN = "/api/v1/admin"
const HOUR = 60 * 60 * 1000

let adminApi

beforeAll(async () => {
  await setupTestDb()
  adminApi = await as(await seed.admin())
})

afterAll(async () => {
  await teardownTestDb()
})

beforeEach(async () => {
  await archiveLiveDiningPeriods()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const caps = (caterers, max = 1000) => caterers.map((c) => ({ catererId: String(c._id), maxStudentCount: c.max ?? max }))

// A period that starts in 10 days; registration closed unless overridden.
const periodPayload = (caterers, extra = {}) => ({
  startDate: utcDay(10),
  endDate: utcDay(20),
  registrationEnabled: false,
  dailyRate: 100,
  eligibilityMode: "all-active",
  mealSlots: [{ name: "Dinner", startTime: "19:00", endTime: "22:00" }],
  catererIds: caterers.map((c) => String(c._id)),
  catererCapacities: caps(caterers),
  ...extra,
})

const windowPayload = (caterers, extra = {}) => periodPayload(caterers, {
  registrationEnabled: true,
  allocationStartAt: new Date(Date.now() + HOUR).toISOString(),
  allocationEndAt: new Date(Date.now() + 2 * HOUR).toISOString(),
  ...extra,
})

const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

describe("auto-allocation validation", () => {
  let caterer
  beforeAll(async () => {
    caterer = await createCaterer({ name: "AutoVal Mess" })
  })

  it("accepts a time after the choice window ends and before the period starts", async () => {
    const at = iso(5 * HOUR)
    const res = await adminApi.post(`${ADMIN}/dining-periods`).send(windowPayload([caterer], { autoAllocationAt: at }))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(new Date(res.body.data.autoAllocationAt).toISOString()).toBe(at)
    expect(res.body.data.autoAllocation).toBeNull()
  })

  it("rejects a time at or before the choice window end", async () => {
    for (const offset of [2 * HOUR, HOUR + 1000]) {
      const res = await adminApi.post(`${ADMIN}/dining-periods`).send(windowPayload([caterer], { autoAllocationAt: iso(offset) }))
      expect(res.status).toBe(400)
      expect(res.body.message).toBe("Auto-allocation must be after the caterer choice window ends")
    }
  })

  it("rejects a time at or after the first day of the period", async () => {
    const start = utcDay(10)
    const localMidnight = new Date(`${start.toISOString().slice(0, 10)}T00:00:00`)
    for (const at of [localMidnight, new Date(localMidnight.getTime() + HOUR)]) {
      const res = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: at.toISOString() }))
      expect(res.status).toBe(400)
      expect(res.body.message).toBe("Auto-allocation must be before the dining period starts")
    }
    const ok = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: new Date(localMidnight.getTime() - 1000).toISOString() }))
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
  })

  it("a manual-registration period only needs a future time before the start", async () => {
    const res = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: iso(HOUR) }))
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.registrationEnabled).toBe(false)
    const past = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: iso(-HOUR) }))
    expect(past.status).toBe(400)
    expect(past.body.message).toBe("Auto-allocation time must be in the future")
  })

  it("rejects an invalid date; empty means not scheduled", async () => {
    const bad = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: "not-a-date" }))
    expect(bad.status).toBe(400)
    for (const empty of ["", null]) {
      const res = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: empty }))
      expect(res.status).toBe(201)
      expect(res.body.data.autoAllocationAt).toBeNull()
      await archiveLiveDiningPeriods()
    }
  })

  it("edit: arming later, future-only on change, untouched past value, clearing", async () => {
    const created = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer]))
    expect(created.body.data.autoAllocationAt).toBeNull()
    const id = created.body.data.id

    const at = iso(3 * HOUR)
    const armed = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt: at }))
    expect(armed.status, JSON.stringify(armed.body)).toBe(200)
    expect(new Date(armed.body.data.autoAllocationAt).toISOString()).toBe(at)

    // omitted keeps the stored value
    const kept = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { dailyRate: 110 }))
    expect(kept.status).toBe(200)
    expect(new Date(kept.body.data.autoAllocationAt).toISOString()).toBe(at)

    // a changed value must be in the future
    const toPast = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt: iso(-HOUR) }))
    expect(toPast.status).toBe(400)
    expect(toPast.body.message).toBe("Auto-allocation time must be in the future")

    // an untouched value that has since passed does not block other edits
    const past = new Date(Date.now() - HOUR)
    await DiningPeriod.updateOne({ _id: id }, { $set: { autoAllocationAt: past } })
    const edited = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { dailyRate: 120, autoAllocationAt: past.toISOString() }))
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)

    // clearing is allowed before it has run
    const cleared = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt: null }))
    expect(cleared.status).toBe(200)
    expect(cleared.body.data.autoAllocationAt).toBeNull()
  })

  it("edit: the time is locked once the run has started or finished", async () => {
    const at = new Date(Date.now() + 3 * HOUR)
    const created = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: at.toISOString() }))
    const id = created.body.data.id
    await DiningPeriod.updateOne({ _id: id }, { $set: { autoAllocation: { status: "completed", completedAt: new Date(), assigned: 0, leftOver: 0, unallocatedBefore: 0 } } })

    const message = "Auto-allocation has already run for this period; its time can no longer be changed"
    for (const autoAllocationAt of [iso(4 * HOUR), null]) {
      const res = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt }))
      expect(res.status).toBe(400)
      expect(res.body.message).toBe(message)
    }
    const same = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt: at.toISOString(), dailyRate: 130 }))
    expect(same.status, JSON.stringify(same.body)).toBe(200)
    const omitted = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { dailyRate: 140 }))
    expect(omitted.status).toBe(200)
    expect(new Date(omitted.body.data.autoAllocationAt).toISOString()).toBe(at.toISOString())
    expect(omitted.body.data.autoAllocation).toMatchObject({ status: "completed", assigned: 0, leftOver: 0, byCaterer: [], error: null })
  })

  it("edit: a failed run, or one stuck running past an hour, can be re-armed; a fresh running one cannot", async () => {
    const message = "Auto-allocation has already run for this period; its time can no longer be changed"
    const states = [
      { autoAllocation: { status: "failed", completedAt: new Date(), error: "boom" }, rearm: true },
      { autoAllocation: { status: "running", startedAt: new Date(Date.now() - 2 * HOUR) }, rearm: true },
      { autoAllocation: { status: "running", startedAt: new Date(Date.now() - 5 * 60 * 1000) }, rearm: false },
    ]
    for (const state of states) {
      await archiveLiveDiningPeriods()
      const created = await adminApi.post(`${ADMIN}/dining-periods`).send(periodPayload([caterer], { autoAllocationAt: iso(3 * HOUR) }))
      const id = created.body.data.id
      await DiningPeriod.updateOne({ _id: id }, { $set: { autoAllocation: state.autoAllocation } })
      const next = iso(5 * HOUR)
      const res = await adminApi.put(`${ADMIN}/dining-periods/${id}`).send(periodPayload([caterer], { autoAllocationAt: next }))
      if (state.rearm) {
        expect(res.status, JSON.stringify(res.body)).toBe(200)
        expect(new Date(res.body.data.autoAllocationAt).toISOString()).toBe(next)
        expect(res.body.data.autoAllocation).toBeNull()
      } else {
        expect(res.status).toBe(400)
        expect(res.body.message).toBe(message)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

let rollSeq = 0
const makeStudent = async ({ roll, status = "Active" } = {}) => {
  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id, rollNumber: roll || `AUTO${String(++rollSeq).padStart(4, "0")}`, status })
  return { user, profile }
}
const makeStudents = async (n, opts) => {
  const out = []
  for (let i = 0; i < n; i += 1) out.push(await makeStudent(opts))
  return out
}

// A due period: auto-allocation time already passed, service not over.
const duePeriod = async (caterers, extra = {}) => createDiningPeriod({
  registrationEnabled: false,
  allocationStartAt: null,
  allocationEndAt: null,
  startDate: utcDay(0),
  endDate: utcDay(10),
  catererIds: caterers.map((c) => c._id),
  catererCapacities: caterers.map((c) => ({ catererId: c._id, maxStudentCount: c.max ?? 100 })),
  autoAllocationAt: new Date(Date.now() - HOUR),
  ...extra,
})

const rowsFor = (periodId) => DiningAllocation.find({ periodId }).lean()
const countsByCaterer = async (periodId) => {
  const map = new Map()
  for (const row of await rowsFor(periodId)) map.set(String(row.catererId), (map.get(String(row.catererId)) || 0) + 1)
  return map
}
const reload = (periodId) => DiningPeriod.findById(periodId).lean()

describe("auto-allocation job", () => {
  it("never touches periods without a time, in the future, archived, or already ended", async () => {
    const c = await createCaterer()
    await makeStudents(2)
    const none = await duePeriod([c], { autoAllocationAt: null })
    const result = await runDueDiningAutoAllocations()
    expect(result.processed).toBe(0)
    expect((await rowsFor(none._id)).length).toBe(0)
    expect((await reload(none._id)).autoAllocation ?? null).toBeNull()

    await DiningPeriod.updateOne({ _id: none._id }, { $set: { isArchived: true } })
    for (const extra of [
      { autoAllocationAt: new Date(Date.now() + HOUR) },
      { isArchived: true },
      { startDate: utcDay(-20), endDate: utcDay(-10) },
    ]) {
      const p = await duePeriod([c], extra)
      expect((await runDueDiningAutoAllocations()).processed).toBe(0)
      expect((await rowsFor(p._id)).length).toBe(0)
      await DiningPeriod.updateOne({ _id: p._id }, { $set: { isArchived: true } })
    }
    // an injected `now` past the time makes the future one due
    const future = await duePeriod([c], { autoAllocationAt: new Date(Date.now() + HOUR) })
    expect((await runDueDiningAutoAllocations({ now: new Date(Date.now() + 2 * HOUR) })).processed).toBe(1)
    expect((await rowsFor(future._id)).length).toBeGreaterThan(0)
  })

  it("assigns only eligible, unallocated students and leaves existing allocations alone", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    const period = await duePeriod([a, b])
    const [pre, ...fresh] = await makeStudents(4)
    const inactive = await makeStudent({ status: "Inactive" })
    // pre-allocated to B through the owner so the seat counter matches
    await allocationOwner.assignStudent({ periodId: period._id, studentUserId: pre.user._id, studentProfileId: pre.profile._id, rollNumber: pre.profile.rollNumber, catererId: b._id })
    // every other Active student in the db (from earlier tests) is also eligible
    const others = await DiningAllocation.countDocuments({ periodId: period._id })
    expect(others).toBe(1)

    const { processed, results } = await runDueDiningAutoAllocations()
    expect(processed).toBe(1)
    expect(results[0].status).toBe("completed")

    const rows = await rowsFor(period._id)
    const byUser = new Map(rows.map((r) => [String(r.studentUserId), r]))
    expect(String(byUser.get(String(pre.user._id)).catererId)).toBe(String(b._id))
    // Rows the job creates are marked unregistered; the pre-existing one is not.
    expect(byUser.get(String(pre.user._id)).unregistered).toBe(false)
    for (const s of fresh) expect(byUser.has(String(s.user._id))).toBe(true)
    for (const s of fresh) expect(byUser.get(String(s.user._id)).unregistered).toBe(true)
    expect(byUser.has(String(inactive.user._id))).toBe(false)

    const saved = await reload(period._id)
    expect(saved.autoAllocation.status).toBe("completed")
    expect(saved.autoAllocation.startedAt).toBeTruthy()
    expect(saved.autoAllocation.completedAt).toBeTruthy()
    expect(saved.autoAllocation.assigned).toBe(rows.length - 1)
    expect(saved.autoAllocation.unallocatedBefore).toBe(rows.length - 1)
    expect(saved.autoAllocation.leftOver).toBe(0)
    expect(saved.autoAllocation.byCaterer.reduce((s, e) => s + e.assigned, 0)).toBe(rows.length - 1)
  })

  it("respects a custom roll list", async () => {
    const a = await createCaterer()
    const students = await makeStudents(5)
    const listed = students.slice(0, 3)
    const period = await duePeriod([a], {
      eligibilityMode: "custom",
      eligibleRollNumbers: listed.map((s) => s.profile.rollNumber.toLowerCase()),
    })
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", assigned: 3, leftOver: 0, unallocatedBefore: 3 })
    const ids = (await rowsFor(period._id)).map((r) => String(r.studentUserId)).sort()
    expect(ids).toEqual(listed.map((s) => String(s.user._id)).sort())
  })

  it("evens out headcounts (not fill ratios) and never exceeds capacity", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    a.max = 10
    b.max = 5
    const students = await makeStudents(6)
    const period = await duePeriod([a, b], {
      eligibilityMode: "custom",
      eligibleRollNumbers: students.map((s) => s.profile.rollNumber),
    })
    await runDueDiningAutoAllocations()
    const counts = await countsByCaterer(period._id)
    expect(counts.get(String(a._id))).toBe(3)
    expect(counts.get(String(b._id))).toBe(3)
    const saved = await reload(period._id)
    for (const entry of saved.catererCapacities) {
      expect(entry.allocatedCount).toBe(counts.get(String(entry.catererId)))
      expect(entry.allocatedCount).toBeLessThanOrEqual(entry.maxStudentCount)
    }
  })

  it("tops up the caterers behind before the one already ahead", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    const c = await createCaterer()
    const students = await makeStudents(10)
    const period = await duePeriod([a, b, c], {
      eligibilityMode: "custom",
      eligibleRollNumbers: students.map((s) => s.profile.rollNumber),
    })
    // 4 students already chose A themselves
    for (const s of students.slice(0, 4)) {
      const outcome = await allocationOwner.assignStudent({
        periodId: period._id, studentUserId: s.user._id, studentProfileId: s.profile._id,
        rollNumber: s.profile.rollNumber, catererId: a._id, force: false, allowMove: false,
      })
      expect(outcome.ok).toBe(true)
    }
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", assigned: 6, leftOver: 0 })
    const counts = await countsByCaterer(period._id)
    // 6 auto-allocated all go to B and C (3 each) while A stays ahead at 4
    expect([counts.get(String(a._id)), counts.get(String(b._id)), counts.get(String(c._id))]).toEqual([4, 3, 3])
    const rows = await rowsFor(period._id)
    expect(rows.filter((r) => r.unregistered).every((r) => String(r.catererId) !== String(a._id))).toBe(true)
  })

  it("fills the roomier caterer once the other is full and records students left over", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    a.max = 2
    b.max = 1
    const students = await makeStudents(5)
    const period = await duePeriod([a, b], {
      eligibilityMode: "custom",
      eligibleRollNumbers: students.map((s) => s.profile.rollNumber),
    })
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", unallocatedBefore: 5, assigned: 3, leftOver: 2 })
    const counts = await countsByCaterer(period._id)
    expect(counts.get(String(a._id))).toBe(2)
    expect(counts.get(String(b._id))).toBe(1)
    const saved = await reload(period._id)
    expect(saved.autoAllocation).toMatchObject({ status: "completed", assigned: 3, leftOver: 2, unallocatedBefore: 5 })
    expect(saved.catererCapacities.every((e) => e.allocatedCount === e.maxStudentCount)).toBe(true)
  })

  it("retries the next caterer when the owner reports full", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    const [s] = await makeStudents(1)
    const period = await duePeriod([a, b], { eligibilityMode: "custom", eligibleRollNumbers: [s.profile.rollNumber] })
    const real = allocationOwner.assignStudent.bind(allocationOwner)
    const spy = vi.spyOn(allocationOwner, "assignStudent").mockImplementationOnce(async () => ({ ok: false, reason: "full" }))
    spy.mockImplementation(real)
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", assigned: 1, leftOver: 0 })
    expect(spy).toHaveBeenCalledTimes(2)
    expect((await rowsFor(period._id)).length).toBe(1)
  })

  it("skips a student a manual assignment raced, without counting them", async () => {
    const a = await createCaterer()
    const [s] = await makeStudents(1)
    const period = await duePeriod([a], { eligibilityMode: "custom", eligibleRollNumbers: [s.profile.rollNumber] })
    vi.spyOn(allocationOwner, "assignStudent").mockResolvedValueOnce({ ok: false, reason: "already-allocated" })
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", assigned: 0, leftOver: 0, unallocatedBefore: 1 })
    expect((await rowsFor(period._id)).length).toBe(0)
  })

  it("records a failed run on an unexpected error and does not retry it", async () => {
    const a = await createCaterer()
    const [s] = await makeStudents(1)
    const period = await duePeriod([a], { eligibilityMode: "custom", eligibleRollNumbers: [s.profile.rollNumber] })
    vi.spyOn(allocationOwner, "assignStudent").mockRejectedValueOnce(new Error("boom"))
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "failed", error: "boom" })
    expect(errSpy).toHaveBeenCalled()
    const saved = await reload(period._id)
    expect(saved.autoAllocation).toMatchObject({ status: "failed", error: "boom" })
    expect((await runDueDiningAutoAllocations()).processed).toBe(0)
  })

  it("a re-armed failed run is claimed again and finishes the job", async () => {
    const a = await createCaterer()
    const [s1, s2] = await makeStudents(2)
    const period = await duePeriod([a], { eligibilityMode: "custom", eligibleRollNumbers: [s1.profile.rollNumber, s2.profile.rollNumber] })
    // The first student lands, then the run dies.
    const real = allocationOwner.assignStudent.bind(allocationOwner)
    vi.spyOn(allocationOwner, "assignStudent").mockImplementationOnce(real).mockRejectedValueOnce(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await runDueDiningAutoAllocations()).results[0]).toMatchObject({ status: "failed" })
    vi.restoreAllMocks()
    expect(await rowsFor(period._id)).toHaveLength(1)
    // Re-arming (what the edit does) makes it claimable; the retry skips the student already placed.
    await DiningPeriod.updateOne({ _id: period._id }, { $set: { autoAllocation: null, autoAllocationAt: new Date(Date.now() - 60 * 1000) } })
    vi.spyOn(console, "log").mockImplementation(() => {})
    const { results } = await runDueDiningAutoAllocations()
    expect(results[0]).toMatchObject({ status: "completed", unallocatedBefore: 1, assigned: 1, leftOver: 0 })
    expect(await rowsFor(period._id)).toHaveLength(2)
  })

  it("is idempotent: a second run claims nothing and changes nothing", async () => {
    const a = await createCaterer()
    const students = await makeStudents(3)
    const period = await duePeriod([a], { eligibilityMode: "custom", eligibleRollNumbers: students.map((s) => s.profile.rollNumber) })
    expect((await runDueDiningAutoAllocations()).processed).toBe(1)
    const before = await rowsFor(period._id)
    const second = await runDueDiningAutoAllocations()
    expect(second.processed).toBe(0)
    expect((await rowsFor(period._id)).length).toBe(before.length)
    expect((await reload(period._id)).autoAllocation.assigned).toBe(3)
  })

  it("concurrent runs do not double-assign", async () => {
    const a = await createCaterer()
    const b = await createCaterer()
    const students = await makeStudents(8)
    const period = await duePeriod([a, b], { eligibilityMode: "custom", eligibleRollNumbers: students.map((s) => s.profile.rollNumber) })
    const runs = await Promise.all([runDueDiningAutoAllocations(), runDueDiningAutoAllocations(), runDueDiningAutoAllocations()])
    expect(runs.reduce((sum, r) => sum + r.processed, 0)).toBe(1)
    const rows = await rowsFor(period._id)
    expect(rows.length).toBe(8)
    expect(new Set(rows.map((r) => String(r.studentUserId))).size).toBe(8)
    const saved = await reload(period._id)
    expect(saved.catererCapacities.reduce((s, e) => s + e.allocatedCount, 0)).toBe(8)
    expect(saved.autoAllocation.assigned).toBe(8)
  })
})

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

describe("auto-allocation exposure", () => {
  it("dining-allocations periods/roster expose the schedule and result (detail for oversight only)", async () => {
    const login = await catererFixture()
    const other = await createCaterer()
    const [s] = await makeStudents(1)
    const at = new Date(Date.now() - HOUR)
    const period = await duePeriod([login.caterer, other], {
      autoAllocationAt: at,
      eligibilityMode: "custom",
      eligibleRollNumbers: [s.profile.rollNumber],
    })
    await runDueDiningAutoAllocations()

    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    const mine = await as(login.user)
    const find = (body) => body.data.periods.find((p) => p.id === String(period._id))

    const o = find((await office.get("/api/v1/dining-allocations/periods")).body)
    expect(new Date(o.autoAllocationAt).toISOString()).toBe(at.toISOString())
    expect(o.autoAllocation).toMatchObject({ status: "completed", assigned: 1, leftOver: 0, unallocatedBefore: 1, error: null })
    expect(o.autoAllocation.byCaterer).toHaveLength(1)

    const c = find((await mine.get("/api/v1/dining-allocations/periods")).body)
    expect(c.autoAllocation).toMatchObject({ status: "completed", assigned: 1 })
    expect(c.autoAllocation.byCaterer).toBeUndefined()
    expect(c.autoAllocation.error).toBeUndefined()

    const roster = await office.get("/api/v1/dining-allocations/roster").query({ periodId: String(period._id) })
    expect(roster.status, JSON.stringify(roster.body)).toBe(200)
    expect(roster.body.data.period.autoAllocation.status).toBe("completed")
    expect(new Date(roster.body.data.period.autoAllocationAt).toISOString()).toBe(at.toISOString())
  })

  it("periods without a schedule expose nulls", async () => {
    const login = await catererFixture()
    const period = await duePeriod([login.caterer], { autoAllocationAt: null })
    const res = await (await as(login.user)).get("/api/v1/dining-allocations/periods")
    const row = res.body.data.periods.find((p) => p.id === String(period._id))
    expect(row.autoAllocationAt).toBeNull()
    expect(row.autoAllocation).toBeNull()
  })

  it("the student portal carries autoAllocationAt for the open choice window", async () => {
    const c = await createCaterer()
    const student = await makeStudent()
    const at = new Date(Date.now() + 3 * HOUR)
    const period = await createDiningPeriod({
      startDate: utcDay(5),
      endDate: utcDay(15),
      catererIds: [c._id],
      catererCapacities: [{ catererId: c._id, maxStudentCount: 50 }],
      autoAllocationAt: at,
    })
    const res = await (await as(student.user)).get("/api/v1/students/dining/portal")
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const open = res.body.data.activeAllocationPeriod
    expect(open.id).toBe(String(period._id))
    expect(new Date(open.autoAllocationAt).toISOString()).toBe(at.toISOString())
    expect(res.body.data.period.autoAllocationAt).toBeTruthy()
  })
})
