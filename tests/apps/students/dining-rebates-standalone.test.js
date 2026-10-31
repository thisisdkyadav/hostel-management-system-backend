/**
 * Standalone dining rebates (temp/dining-rebates-standalone-contract.md):
 * rebates are per-student date ranges, rules are global (config diningRebate),
 * short/long is decided on the whole request, the short-term cap is counted per
 * existing period, days with no period are accepted and attribute later.
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
} from "../../helpers/seed/students.js"
import { getApprovedRebateStudentIdsForDay } from "../../../src/services/dining/dining-rebate.service.js"

const BASE = "/api/v1/students/dining"
const range = (from, to) => ({ startDate: dayKey(utcDay(from)), endDate: dayKey(utcDay(to)) })
const keys = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => dayKey(utcDay(from + i)))

let adminApi
let rollSeq = 0

const setRules = async (rules) => {
  const res = await adminApi.put("/api/v1/config/diningRebate").send({ value: rules })
  expect(res.status).toBe(200)
}

const resetRules = () => setRules({
  shortTermMaxTotalDays: 10,
  shortTermMaxContinuousDays: 3,
  shortTermMinApplicationDays: 1,
  shortTermMinAdvanceDays: 2,
})

const newStudent = async () => {
  const user = await seed.student()
  const rollNumber = `STD${String(++rollSeq).padStart(3, "0")}`
  const profile = await createStudentProfile({ userId: user._id, rollNumber })
  return { user, profile, rollNumber, api: await as(user) }
}

const seedRebate = async (student, { from, to, type = "short-term", status = "approved" }) => {
  const { DiningRebate } = await import("../../../src/models/index.js")
  const dateKeys = keys(from, to)
  return DiningRebate.create({
    requestGroupId: `seed-${student.rollNumber}-${from}-${to}`,
    studentUserId: student.user._id,
    studentProfileId: student.profile._id,
    rollNumber: student.rollNumber,
    startDate: utcDay(from),
    endDate: utcDay(to),
    dateKeys,
    dayCount: dateKeys.length,
    type,
    status,
  })
}

const allocate = (student, period, caterer) => createDiningAllocation({
  periodId: period._id,
  studentUserId: student.user._id,
  studentProfileId: student.profile._id,
  rollNumber: student.rollNumber,
  catererId: caterer._id,
})

beforeAll(async () => {
  await setupTestDb()
  adminApi = await as(await seed.admin())
})

afterAll(async () => {
  await teardownTestDb()
})

// "28 Jan – 2 Feb" shape: period A ends at +33, period B starts at +34; the
// request +30..+35 is 6 continuous days (4 in A, 2 in B).
describe("cross-period rebate (28 Jan – 2 Feb example)", () => {
  let periodA
  let periodB
  let catererA
  let catererB

  beforeAll(async () => {
    await setRules({ shortTermMaxTotalDays: 10, shortTermMaxContinuousDays: 7, shortTermMinApplicationDays: 1, shortTermMinAdvanceDays: 2 })
    catererA = await createCaterer({ name: "Jan Mess" })
    catererB = await createCaterer({ name: "Feb Mess" })
    periodA = await createDiningPeriod({ startDate: utcDay(20), endDate: utcDay(33) })
    periodB = await createDiningPeriod({ startDate: utcDay(34), endDate: utcDay(63) })
  })

  afterAll(resetRules)

  it("6 continuous days ≤ 7 is short-term; preview splits 4 + 2 over the two periods", async () => {
    const s = await newStudent()
    await allocate(s, periodA, catererA)
    await allocate(s, periodB, catererB)

    const preview = await s.api.post(`${BASE}/rebates/preview`).send(range(30, 35))
    expect(preview.status).toBe(200)
    expect(preview.body.data).toMatchObject({
      type: "short-term",
      status: "approved",
      dayCount: 6,
      unplacedDayCount: 0,
      hasLongTerm: false,
      formRequired: false,
    })
    expect(preview.body.data.placements).toEqual([
      expect.objectContaining({ periodId: String(periodA._id), caterer: { id: String(catererA._id), name: "Jan Mess" }, dayCount: 4, usedShortTermDays: 0, maxShortTermDays: 10 }),
      expect.objectContaining({ periodId: String(periodB._id), caterer: { id: String(catererB._id), name: "Feb Mess" }, dayCount: 2, usedShortTermDays: 0, maxShortTermDays: 10 }),
    ])

    const res = await s.api.post(`${BASE}/rebates`).send({ ...range(30, 35), acknowledgeRegistration: true, reason: "Home" })
    expect(res.status).toBe(201)
    expect(res.body.message).toBe("Short-term rebate approved")
    expect(res.body.data.rebates).toHaveLength(1) // ONE row per request
    const created = res.body.data.rebates[0]
    expect(created).toMatchObject({ type: "short-term", status: "approved", dayCount: 6, periodId: null, catererId: null })
    expect(created.dateKeys).toEqual(keys(30, 35))
    expect(created.placements.map((p) => [p.periodId, p.caterer?.name, p.dayCount, p.dateKeys])).toEqual([
      [String(periodA._id), "Jan Mess", 4, keys(30, 33)],
      [String(periodB._id), "Feb Mess", 2, keys(34, 35)],
    ])

    // Each caterer sees the student off only on its own period's days.
    expect(await getApprovedRebateStudentIdsForDay({ periodId: periodA._id, catererId: catererA._id, date: utcDay(32) })).toContain(String(s.user._id))
    expect(await getApprovedRebateStudentIdsForDay({ periodId: periodB._id, catererId: catererB._id, date: utcDay(35) })).toContain(String(s.user._id))
    expect(await getApprovedRebateStudentIdsForDay({ periodId: periodA._id, catererId: catererA._id, date: utcDay(34) })).not.toContain(String(s.user._id))
    expect(await getApprovedRebateStudentIdsForDay({ periodId: periodB._id, catererId: catererA._id, date: utcDay(35) })).not.toContain(String(s.user._id))
  })

  it("continuous length is counted on the whole request: with max continuous 5 the same 4 + 2 is long-term", async () => {
    await setRules({ shortTermMaxContinuousDays: 5 })
    try {
      const s = await newStudent()
      const preview = await s.api.post(`${BASE}/rebates/preview`).send(range(30, 35))
      expect(preview.status).toBe(200)
      expect(preview.body.data).toMatchObject({ type: "long-term", status: "pending", hasLongTerm: true })
      const res = await s.api.post(`${BASE}/rebates`).send({ ...range(30, 35), acknowledgeRegistration: true, reason: "Long" })
      expect(res.status).toBe(201)
      expect(res.body.message).toBe("Long-term rebate request submitted for approval")
      expect(res.body.data.rebates[0]).toMatchObject({ type: "long-term", status: "pending" })
    } finally {
      await setRules({ shortTermMaxContinuousDays: 7 })
    }
  })

  it("per-period cap is counted per period: 6 used in A + 4 and 8 used in B + 2 both pass (10 each)", async () => {
    const s = await newStudent()
    await seedRebate(s, { from: 20, to: 25 }) // 6 approved short-term days in A
    await seedRebate(s, { from: 40, to: 47 }) // 8 approved short-term days in B
    await seedRebate(s, { from: 50, to: 52, type: "long-term", status: "approved" }) // long-term never counts
    await seedRebate(s, { from: 54, to: 55, status: "pending" }) // pending never counts

    const preview = await s.api.post(`${BASE}/rebates/preview`).send(range(30, 35))
    expect(preview.status).toBe(200)
    expect(preview.body.data.placements.map((p) => p.usedShortTermDays)).toEqual([6, 8])

    const res = await s.api.post(`${BASE}/rebates`).send({ ...range(30, 35), acknowledgeRegistration: true, reason: "Exactly at the cap" })
    expect(res.status).toBe(201)
    expect(res.body.data.rebates[0].type).toBe("short-term")
  })

  it("fails when the days inside period A would exceed its cap", async () => {
    const s = await newStudent()
    await seedRebate(s, { from: 20, to: 26 }) // 7 used in A; +4 = 11
    const res = await s.api.post(`${BASE}/rebates`).send({ ...range(30, 35), acknowledgeRegistration: true, reason: "Over in A" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("Short-term rebate limit exceeded")
    expect(res.body.message).toContain("Available days: 3")
    const preview = await s.api.post(`${BASE}/rebates/preview`).send(range(30, 35))
    expect(preview.status).toBe(400)
    expect(preview.body.message).toBe(res.body.message)
  })

  it("fails when the days inside period B would exceed its cap", async () => {
    const s = await newStudent()
    await seedRebate(s, { from: 40, to: 48 }) // 9 used in B; +2 = 11
    const res = await s.api.post(`${BASE}/rebates`).send({ ...range(30, 35), acknowledgeRegistration: true, reason: "Over in B" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("Available days: 1")
  })

  it("days outside any period are not capped", async () => {
    await setRules({ shortTermMaxTotalDays: 0 })
    try {
      const s = await newStudent()
      const res = await s.api.post(`${BASE}/rebates`).send({ ...range(120, 121), acknowledgeRegistration: true, reason: "No period" })
      expect(res.status).toBe(201)
      expect(res.body.data.rebates[0]).toMatchObject({ type: "short-term", unplacedDayCount: 2, placements: [] })
      const blocked = await s.api.post(`${BASE}/rebates`).send({ ...range(36, 36), acknowledgeRegistration: true, reason: "In B" })
      expect(blocked.status).toBe(400)
      expect(blocked.body.message).toContain("Available days: 0")
    } finally {
      await setRules({ shortTermMaxTotalDays: 10 })
    }
  })
})

describe("rebates on days with no dining period", () => {
  it("are accepted with no allocation, then attribute once a period + allocation exist", async () => {
    const s = await newStudent()
    const res = await s.api.post(`${BASE}/rebates/preview`).send(range(140, 141))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ type: "short-term", dayCount: 2, placements: [], unplacedDayCount: 2 })

    const created = await s.api.post(`${BASE}/rebates`).send({ ...range(140, 141), acknowledgeRegistration: true, reason: "Future trip" })
    expect(created.status).toBe(201)
    const rebateId = created.body.data.rebates[0].id
    expect(created.body.data.rebates[0]).toMatchObject({ placements: [], unplacedDayCount: 2 })

    // Later: a period covering only the first day is created and the student is allocated.
    const caterer = await createCaterer({ name: "Later Mess" })
    const other = await createCaterer({ name: "Other Mess" })
    const period = await createDiningPeriod({ startDate: utcDay(130), endDate: utcDay(140) })
    await allocate(s, period, caterer)

    const list = await s.api.get(`${BASE}/rebates`)
    const row = list.body.data.rebates.find((r) => r.id === rebateId)
    expect(row.placements).toEqual([
      {
        periodId: String(period._id),
        period: { id: String(period._id), startDate: utcDay(130).toISOString(), endDate: utcDay(140).toISOString() },
        caterer: { id: String(caterer._id), name: "Later Mess" },
        counted: true,
        dayCount: 1,
        dateKeys: [dayKey(utcDay(140))],
      },
    ])
    expect(row.unplacedDayCount).toBe(1)

    const adminList = await adminApi.get("/api/v1/admin/dining-rebates").query({ status: "approved" })
    const adminRow = adminList.body.data.rebates.find((r) => r.id === rebateId)
    expect(adminRow.placements[0].caterer.name).toBe("Later Mess")
    expect(adminRow.unplacedDayCount).toBe(1)

    expect(await getApprovedRebateStudentIdsForDay({ periodId: period._id, catererId: caterer._id, date: utcDay(140) }))
      .toContain(String(s.user._id))
    // day outside the period, or another caterer: not attributed
    expect(await getApprovedRebateStudentIdsForDay({ periodId: period._id, catererId: caterer._id, date: utcDay(141) }))
      .not.toContain(String(s.user._id))
    expect(await getApprovedRebateStudentIdsForDay({ periodId: period._id, catererId: other._id, date: utcDay(140) }))
      .not.toContain(String(s.user._id))
  })
})

describe("6-month horizon", () => {
  const sixMonthsKey = () => {
    const now = utcDay(0)
    const month = now.getUTCMonth() + 6
    const last = new Date(Date.UTC(now.getUTCFullYear(), month + 1, 0)).getUTCDate()
    return new Date(Date.UTC(now.getUTCFullYear(), month, Math.min(now.getUTCDate(), last))).toISOString().slice(0, 10)
  }
  const plusDays = (key, days) => new Date(new Date(`${key}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10)

  it("allows the last day exactly 6 months ahead and 400s one day later", async () => {
    const s = await newStudent()
    const limit = sixMonthsKey()
    const ok = await s.api.post(`${BASE}/rebates`).send({ startDate: limit, endDate: limit, acknowledgeRegistration: true, reason: "Edge" })
    expect(ok.status).toBe(201)

    const tooFar = await s.api.post(`${BASE}/rebates`).send({ startDate: plusDays(limit, 1), endDate: plusDays(limit, 1), reason: "Too far" })
    expect(tooFar.status).toBe(400)
    expect(tooFar.body.message).toMatch(/at most 6 months ahead/)

    // A long range whose END crosses the limit is refused too.
    const crossing = await s.api.post(`${BASE}/rebates/preview`).send({ startDate: plusDays(limit, -3), endDate: plusDays(limit, 2) })
    expect(crossing.status).toBe(400)
    expect(crossing.body.message).toMatch(/at most 6 months ahead/)
  })
})

describe("overlap is checked per student", () => {
  it("blocks the same student's approved/pending days, ignores rejected and other students", async () => {
    const s = await newStudent()
    const t = await newStudent()
    await seedRebate(s, { from: 70, to: 71 })
    await seedRebate(s, { from: 75, to: 79, type: "long-term", status: "pending" })
    await seedRebate(s, { from: 85, to: 86, status: "rejected" })

    for (const [from, to] of [[71, 72], [79, 80]]) {
      const res = await s.api.post(`${BASE}/rebates`).send({ ...range(from, to), acknowledgeRegistration: true, reason: "Overlap" })
      expect(res.status, `${from}-${to}`).toBe(400)
      expect(res.body.message).toBe("One or more selected days already have a rebate request")
    }

    expect((await s.api.post(`${BASE}/rebates`).send({ ...range(85, 86), acknowledgeRegistration: true, reason: "Was rejected" })).status).toBe(201)
    expect((await t.api.post(`${BASE}/rebates`).send({ ...range(71, 72), acknowledgeRegistration: true, reason: "Other student" })).status).toBe(201)
  })

  it("admin approve re-checks overlap for the student", async () => {
    const s = await newStudent()
    const pending = await seedRebate(s, { from: 90, to: 95, type: "long-term", status: "pending" })
    await seedRebate(s, { from: 95, to: 95 }) // approved, overlapping day 95 (seeded directly)
    const res = await adminApi.put(`/api/v1/admin/dining-rebates/${pending._id}/approve`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("This rebate overlaps with another active rebate request")
  })
})

describe("rules come from config diningRebate", () => {
  afterAll(resetRules)

  it("GET /rebates returns the rules; changed rules apply to new requests", async () => {
    const s = await newStudent()
    let list = await s.api.get(`${BASE}/rebates`)
    expect(list.body.data.rules).toEqual({
      shortTermMaxTotalDays: 10,
      shortTermMaxContinuousDays: 3,
      shortTermMinApplicationDays: 1,
      shortTermMinAdvanceDays: 2,
      maxAdvanceMonths: 6,
      unregisteredPeriods: [],
    })

    await setRules({ shortTermMaxTotalDays: 4, shortTermMaxContinuousDays: 4, shortTermMinApplicationDays: 2, shortTermMinAdvanceDays: 5 })
    list = await s.api.get(`${BASE}/rebates`)
    expect(list.body.data.rules).toMatchObject({ shortTermMaxContinuousDays: 4, shortTermMinApplicationDays: 2, shortTermMinAdvanceDays: 5 })

    let res = await s.api.post(`${BASE}/rebates`).send({ ...range(3, 4), acknowledgeRegistration: true, reason: "Too soon" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Short-term rebate must be requested at least 5 day(s) in advance")

    res = await s.api.post(`${BASE}/rebates`).send({ ...range(150, 150), acknowledgeRegistration: true, reason: "Too short" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Short-term rebate must be at least 2 day(s)")

    // 4 days is still short-term under max continuous 4 (it was long-term under 3).
    res = await s.api.post(`${BASE}/rebates/preview`).send(range(150, 153))
    expect(res.body.data.type).toBe("short-term")
    res = await s.api.post(`${BASE}/rebates/preview`).send(range(150, 154))
    expect(res.body.data.type).toBe("long-term")
  })

  it("period rebateSettings are ignored (a period with a tiny legacy cap does not limit)", async () => {
    await resetRules()
    const s = await newStudent()
    const caterer = await createCaterer({ name: "Legacy Settings Mess" })
    const period = await createDiningPeriod({
      startDate: utcDay(160),
      endDate: utcDay(175),
      rebateSettings: { shortTermMaxTotalDays: 0, shortTermMaxContinuousDays: 1, shortTermMinApplicationDays: 1, shortTermMinAdvanceDays: 0 },
    })
    await allocate(s, period, caterer)
    const res = await s.api.post(`${BASE}/rebates`).send({ ...range(161, 163), acknowledgeRegistration: true, reason: "Legacy settings" })
    expect(res.status).toBe(201)
    expect(res.body.data.rebates[0]).toMatchObject({ type: "short-term", status: "approved" })
    expect(res.body.data.rebates[0].placements[0]).toMatchObject({ dayCount: 3, caterer: { name: "Legacy Settings Mess" } })
  })
})
