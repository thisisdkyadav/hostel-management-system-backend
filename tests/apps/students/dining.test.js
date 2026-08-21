import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  utcDay,
  dayKey,
  createStudentProfile,
  createCaterer,
  createDiningPeriod,
  createDiningAllocation,
  createBillingPeriod,
  createBillingAccount,
} from "../../helpers/seed/students.js"

const BASE = "/api/v1/students/dining"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("dining auth wall", () => {
  it("GET /portal rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("POST /select rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/select`).send({ catererId: "x" })
    expect(res.status).toBe(401)
  })

  it("rejects non-Student roles with 403 (warden)", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("rejects admin with 403 on rebates", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/rebates`)
    expect(res.status).toBe(403)
  })
})

describe("GET /portal", () => {
  it("returns 404 when the student has no profile", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Student profile not found")
  })

  it("reports no open period when nothing is configured", async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "POR000" })
    const api = await as(student)
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.canSelect).toBe(false)
    expect(res.body.data.currentPeriod).toBeNull()
    expect(res.body.data.activeAllocationPeriod).toBeNull()
    expect(res.body.data.upcomingAllocationPeriod).toBeNull()
    expect(res.body.message).toBe("No dining allocation period is open right now")
  })

  it("shows the open allocation period with caterers and capacities", async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "POR001" })
    const catererA = await createCaterer({ name: "Alpha Mess" })
    const catererB = await createCaterer({ name: "Beta Mess" })
    // Custom eligibility keeps this period private to POR001 so later
    // describes' students never see it.
    await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["POR001"],
      catererIds: [catererA._id, catererB._id],
      catererCapacities: [
        { catererId: catererA._id, maxStudentCount: 1, allocatedCount: 0 },
        { catererId: catererB._id, maxStudentCount: 5, allocatedCount: 0 },
      ],
    })

    const api = await as(student)
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Dining allocation is open")
    expect(res.body.data.canSelect).toBe(true)

    const period = res.body.data.activeAllocationPeriod
    expect(period).toBeTruthy()
    expect(period.allocationStatus).toBe("Open")
    expect(period.caterers.map((c) => c.name).sort()).toEqual(["Alpha Mess", "Beta Mess"])
    expect(period.rebateSettings).toBeTruthy()
    expect(period.selectedAllocation).toBeNull()

    const capacities = period.catererCapacities
    expect(capacities).toHaveLength(2)
    for (const entry of capacities) {
      expect(entry.isFull).toBe(false)
      expect(entry.remainingSeats).toBe(entry.maxStudentCount - entry.allocatedCount)
      expect(entry.caterer.name).toBeTruthy()
    }
  })
})

describe("POST /select + portal state transitions", () => {
  let studentApi
  let otherApi
  let inactiveApi
  let catererA
  let catererB

  beforeAll(async () => {
    // One shared period, custom-eligible to exactly the rolls below.
    catererA = await createCaterer({ name: "Select A" })
    catererB = await createCaterer({ name: "Select B" })
    await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["SEL001", "SEL002", "SEL003"],
      catererIds: [catererA._id, catererB._id],
      catererCapacities: [
        { catererId: catererA._id, maxStudentCount: 1, allocatedCount: 0 },
        { catererId: catererB._id, maxStudentCount: 5, allocatedCount: 0 },
      ],
    })
    const s1 = await seed.student()
    await createStudentProfile({ userId: s1._id, rollNumber: "SEL001" })
    const s2 = await seed.student()
    await createStudentProfile({ userId: s2._id, rollNumber: "SEL002" })
    // Roll number IS in the custom list but status is not Active -> forbidden.
    const s3 = await seed.student()
    await createStudentProfile({ userId: s3._id, rollNumber: "SEL003", status: "Inactive" })
    studentApi = await as(s1)
    otherApi = await as(s2)
    inactiveApi = await as(s3)
  })

  it("rejects an invalid caterer id with 400", async () => {
    const res = await studentApi.post(`${BASE}/select`).send({ catererId: "not-an-objectid" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid caterer selected")
  })

  it("rejects a caterer that is not in the period with 400", async () => {
    const outsider = await createCaterer({ name: "Outsider" })
    const res = await studentApi.post(`${BASE}/select`).send({ catererId: String(outsider._id) })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Selected caterer is not available in this period")
  })

  it("selects a caterer and reflects it in the portal state", async () => {
    const res = await studentApi.post(`${BASE}/select`).send({ catererId: String(catererB._id) })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Caterer selected successfully")

    const state = res.body.data
    expect(state.canSelect).toBe(false)
    expect(state.activeAllocationPeriod.selectedAllocation.catererId).toBe(String(catererB._id))
    const capacityB = state.activeAllocationPeriod.catererCapacities.find(
      (e) => e.catererId === String(catererB._id)
    )
    expect(capacityB.allocatedCount).toBe(1)

    // Persistence through a follow-up GET.
    const portal = await studentApi.get(`${BASE}/portal`)
    expect(portal.status).toBe(200)
    expect(portal.body.data.canSelect).toBe(false)
    expect(portal.body.data.activeAllocationPeriod.selectedAllocation.catererId).toBe(String(catererB._id))
  })

  it("is idempotent when selecting the same caterer again", async () => {
    const res = await studentApi.post(`${BASE}/select`).send({ catererId: String(catererB._id) })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("This caterer is already selected")
  })

  it("moves the student to another caterer and releases the old seat", async () => {
    const res = await studentApi.post(`${BASE}/select`).send({ catererId: String(catererA._id) })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Caterer selected successfully")

    const capacities = res.body.data.activeAllocationPeriod.catererCapacities
    const capA = capacities.find((e) => e.catererId === String(catererA._id))
    const capB = capacities.find((e) => e.catererId === String(catererB._id))
    expect(capA.allocatedCount).toBe(1)
    expect(capB.allocatedCount).toBe(0)
  })

  it("refuses a full caterer with 400 but allows the other one", async () => {
    // Caterer A now holds 1/1 seats; the second student must be refused...
    const full = await otherApi.post(`${BASE}/select`).send({ catererId: String(catererA._id) })
    expect(full.status).toBe(400)
    expect(full.body.message).toBe("This caterer is full. Please select another caterer.")

    // ...but can take the open caterer.
    const ok = await otherApi.post(`${BASE}/select`).send({ catererId: String(catererB._id) })
    expect(ok.status).toBe(200)
    expect(ok.body.message).toBe("Caterer selected successfully")
  })

  it("returns 400 when no allocation window is open (closed period)", async () => {
    const s4 = await seed.student()
    await createStudentProfile({ userId: s4._id, rollNumber: "SEL004" })
    // Their own (only visible) period has a registration window in the past.
    await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["SEL004"],
      startDate: utcDay(-10),
      endDate: utcDay(-5),
      allocationStartAt: new Date(Date.now() - 20 * 60 * 60 * 1000),
      allocationEndAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      catererIds: [catererA._id],
      catererCapacities: [{ catererId: catererA._id, maxStudentCount: 5, allocatedCount: 0 }],
    })
    const api = await as(s4)
    const res = await api.post(`${BASE}/select`).send({ catererId: String(catererA._id) })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No dining allocation period is open right now")
  })

  it("forbids a non-active student whose roll number is in the period", async () => {
    const res = await inactiveApi.post(`${BASE}/select`).send({ catererId: String(catererB._id) })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("You are not eligible for this dining allocation period")
  })

  it("hides the period entirely from students not on the eligibility list", async () => {
    const s5 = await seed.student()
    await createStudentProfile({ userId: s5._id, rollNumber: "SEL005" })
    const api = await as(s5)
    const res = await api.get(`${BASE}/portal`)
    expect(res.status).toBe(200)
    expect(res.body.data.activeAllocationPeriod).toBeNull()
    expect(res.body.data.canSelect).toBe(false)
    expect(res.body.message).toBe("No dining allocation period is open right now")
  })
})

describe("dining rebates", () => {
  let student
  let studentApi
  let caterer
  let mainPeriod

  beforeAll(async () => {
    student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "REB001" })
    caterer = await createCaterer({ name: "Rebate Mess" })
    studentApi = await as(student)

    // Main period REB001 is allocated in; every range below stays inside it.
    mainPeriod = await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["REB001"],
      startDate: utcDay(-5),
      endDate: utcDay(12),
    })
    const profile = await (
      await import("../../../src/models/index.js")
    ).StudentProfile.findOne({ userId: student._id })
    await createDiningAllocation({
      periodId: mainPeriod._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "REB001",
      catererId: caterer._id,
    })
  })

  it("GET /rebates starts empty", async () => {
    const res = await studentApi.get(`${BASE}/rebates`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.rebates).toEqual([])
  })

  it("POST /rebates requires valid dates", async () => {
    const missing = await studentApi.post(`${BASE}/rebates`).send({})
    expect(missing.status).toBe(400)
    expect(missing.body.message).toBe("Valid rebate start and end dates are required")

    const inverted = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(6), endDate: utcDay(5) })
    expect(inverted.status).toBe(400)
    expect(inverted.body.message).toBe("Rebate start date must be before or equal to end date")
  })

  it("POST /rebates rejects dates without a configured dining period", async () => {
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(50), endDate: utcDay(51), reason: "Trip" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No dining period is configured for the selected dates")
  })

  it("POST /rebates requires a caterer allocation for the covered period", async () => {
    // Dedicated period far from every other range so later tests are unaffected.
    await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["REB001"],
      startDate: utcDay(20),
      endDate: utcDay(22),
    })
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(21), endDate: utcDay(21), reason: "Family function" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(
      "Please select your caterer for the next dining period before requesting cross-period rebates"
    )
  })

  it("POST /rebates enforces the advance-notice window", async () => {
    // NOTE: the service checks EVERY period overlapping the requested range
    // (not just eligible ones), so this range must be covered ONLY by the
    // allocated main period (-5..+12); the other open periods span -1..+10.
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(-2), endDate: utcDay(-2), reason: "Too soon" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Short-term rebate must be requested at least 2 day(s) in advance")
  })

  it("SUSPECTED BUG: a fully valid short-term rebate request fails with 422", async () => {
    // SUSPECTED BUG: dining-rebate.service.js buildValidatedRebateSegments
    // builds each segment with a `period` key (the populated object) but the
    // DiningRebate schema requires `periodId`. insertMany therefore always
    // fails Mongoose validation, so NO rebate can ever be created through the
    // API — every valid request returns 422 "Validation failed".
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(11), endDate: utcDay(12), reason: "Short trip home" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Validation failed")
    expect(res.body.errors.some((e) => e.field === "periodId")).toBe(true)
  })

  it("SUSPECTED BUG: a valid long-term (> continuous limit) request also fails with 422", async () => {
    // Same root cause as above; documents that even the pending-approval flow
    // is unreachable through the API.
    const longPeriod = await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["REB001"],
      startDate: utcDay(45),
      endDate: utcDay(60),
    })
    const models = await import("../../../src/models/index.js")
    const profile = await models.StudentProfile.findOne({ userId: student._id })
    await createDiningAllocation({
      periodId: longPeriod._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "REB001",
      catererId: caterer._id,
    })

    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(50), endDate: utcDay(53), reason: "Semester break travel" })
    expect(res.status).toBe(422)
    expect(res.body.message).toBe("Validation failed")
  })

  it("rejects overlapping rebate days with 400", async () => {
    // Seed the conflicting approved rebate directly (creation through the API
    // is broken — see the SUSPECTED BUG tests above).
    const profile = await (
      await import("../../../src/models/index.js")
    ).StudentProfile.findOne({ userId: student._id })
    const { DiningRebate } = await import("../../../src/models/index.js")
    await DiningRebate.create({
      requestGroupId: "seed-overlap-1",
      periodId: mainPeriod._id,
      catererId: caterer._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "REB001",
      startDate: utcDay(11),
      endDate: utcDay(12),
      dateKeys: [dayKey(utcDay(11)), dayKey(utcDay(12))],
      dayCount: 2,
      type: "short-term",
      status: "approved",
      reason: "Seeded conflict",
    })

    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(12), endDate: utcDay(12), reason: "Overlap attempt" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("One or more selected days already have a rebate request")
  })

  it("enforces the total short-term day budget per period", async () => {
    // Fresh student + dedicated period with a tiny budget (2 total days); one
    // approved short-term rebate is seeded directly to consume it.
    const s = await seed.student()
    await createStudentProfile({ userId: s._id, rollNumber: "REB002" })
    const cat = await createCaterer({ name: "Budget Mess" })
    const period = await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["REB002"],
      startDate: utcDay(30),
      endDate: utcDay(40),
      rebateSettings: {
        shortTermMaxTotalDays: 2,
        shortTermMaxContinuousDays: 3,
        shortTermMinApplicationDays: 1,
        shortTermMinAdvanceDays: 1,
      },
    })
    const models = await import("../../../src/models/index.js")
    const profile = await models.StudentProfile.findOne({ userId: s._id })
    await createDiningAllocation({
      periodId: period._id,
      studentUserId: s._id,
      studentProfileId: profile._id,
      rollNumber: "REB002",
      catererId: cat._id,
    })
    await models.DiningRebate.create({
      requestGroupId: "seed-budget-1",
      periodId: period._id,
      catererId: cat._id,
      studentUserId: s._id,
      studentProfileId: profile._id,
      rollNumber: "REB002",
      startDate: utcDay(31),
      endDate: utcDay(32),
      dateKeys: [dayKey(utcDay(31)), dayKey(utcDay(32))],
      dayCount: 2,
      type: "short-term",
      status: "approved",
    })

    const api = await as(s)
    const second = await api
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(35), endDate: utcDay(35), reason: "One day too many" })
    expect(second.status).toBe(400)
    expect(second.body.message).toContain("Short-term rebate limit exceeded")
    expect(second.body.message).toContain("Available days: 0")
  })

  it("rejects cross-period ranges where an allocation is missing", async () => {
    // Second period covering +13..+14 WITHOUT an allocation; span both.
    await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["REB001"],
      startDate: utcDay(13),
      endDate: utcDay(14),
    })
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(12), endDate: utcDay(13), reason: "Spanning" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(
      "Please select your caterer for the next dining period before requesting cross-period rebates"
    )
  })

  it("rejects inactive students with 400", async () => {
    const s = await seed.student()
    await createStudentProfile({ userId: s._id, rollNumber: "REB003", status: "Inactive" })
    const api = await as(s)
    const res = await api
      .post(`${BASE}/rebates`)
      .send({ startDate: utcDay(60), endDate: utcDay(61), reason: "Nope" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Only active students can request dining rebates")
  })

  it("GET /rebates lists seeded rebates with full serialization", async () => {
    const res = await studentApi.get(`${BASE}/rebates`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.rebates).toHaveLength(1)

    const rebate = res.body.data.rebates[0]
    expect(rebate.rollNumber).toBe("REB001")
    expect(rebate.status).toBe("approved")
    expect(rebate.type).toBe("short-term")
    expect(rebate.dayCount).toBe(2)
    expect(rebate.dateKeys).toEqual([dayKey(utcDay(11)), dayKey(utcDay(12))])
    expect(rebate.period.id).toBe(String(mainPeriod._id))
    expect(rebate.caterer.id).toBe(String(caterer._id))
    expect(rebate.caterer.name).toBe("Rebate Mess")
    expect(rebate.studentUserId).toBe(String(student._id))
  })
})

describe("GET /billing", () => {
  it("returns an empty billing list for a student without a profile", async () => {
    // SUSPECTED BUG: unlike every other student-dining route, billing does NOT
    // 404 on a missing student profile — it silently returns an empty list.
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/billing`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.billingPeriods).toEqual([])
  })

  it("returns an empty billing list when nothing is configured", async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "BILL001" })
    const api = await as(student)
    const res = await api.get(`${BASE}/billing`)
    expect(res.status).toBe(200)
    expect(res.body.data.billingPeriods).toEqual([])
  })

  it("computes charges from allocations, elapsed days and approved rebates", async () => {
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id, rollNumber: "BILL002" })
    const caterer = await createCaterer({ name: "Billing Mess" })

    // Running period started 3 UTC-days ago at 100/day.
    const period = await createDiningPeriod({ startDate: utcDay(-3), endDate: utcDay(3), dailyRate: 100 })
    await createDiningAllocation({
      periodId: period._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "BILL002",
      catererId: caterer._id,
    })
    const billingPeriod = await createBillingPeriod({ name: "Aug cycle", diningPeriodIds: [period._id] })
    await createBillingAccount({
      billingPeriodId: billingPeriod._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "BILL002",
      allocatedAmount: 1000,
    })

    const api = await as(student)
    const res = await api.get(`${BASE}/billing`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const periods = res.body.data.billingPeriods
    expect(periods).toHaveLength(1)
    const bill = periods[0]
    expect(bill.name).toBe("Aug cycle")
    expect(bill.allocatedAmount).toBe(1000)

    // Elapsed chargeable days: start..min(end, today) inclusive, minus approved
    // rebate days (none here).
    const today = utcDay(0)
    const elapsedEnd = period.endDate < today ? period.endDate : today
    const expectedDays =
      Math.round((elapsedEnd.getTime() - period.startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1
    expect(bill.totalCharged).toBeCloseTo(expectedDays * 100, 2)
    expect(bill.balance).toBeCloseTo(1000 - expectedDays * 100, 2)
    expect(bill.clearance).toBe(bill.balance >= 0 ? "cleared" : "dues")
    expect(bill.perPeriod).toHaveLength(1)
    expect(bill.perPeriod[0].periodId).toBe(String(period._id))
  })
})
