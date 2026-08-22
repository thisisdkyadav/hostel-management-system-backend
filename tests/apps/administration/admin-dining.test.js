/**
 * Admin dining-administration integration tests.
 *
 * Covers /api/v1/admin routes: hostels, caterers, dining periods,
 * per-period allocations, rebate review, billing periods/accounts and
 * dining-office logins. All routes are Admin-only.
 *
 * Response-shape quirks are documented inline where a route deviates from
 * the standard { success, message?, data } envelope.
 */
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
} from "../../helpers/seed/students.js"

const BASE = "/api/v1/admin"
const DAY_MS = 24 * 60 * 60 * 1000

let adminApi

beforeAll(async () => {
  await setupTestDb()
  const admin = await seed.admin()
  adminApi = await as(admin)
})

afterAll(async () => {
  await teardownTestDb()
})

// ---------------------------------------------------------------------------
// Shared payload builders
// ---------------------------------------------------------------------------

const manualPeriodPayload = ({ caterers, ...extra } = {}) => ({
  startDate: utcDay(-1),
  endDate: utcDay(10),
  registrationEnabled: false, // manual assignment -> no allocation window needed
  dailyRate: 100,
  eligibilityMode: "all-active",
  mealSlots: [{ name: "Dinner", startTime: "19:00", endTime: "22:00" }],
  ...(caterers ? { catererIds: caterers.map((c) => String(c._id)) } : {}),
  ...(caterers
    ? { catererCapacities: caterers.map((c) => ({ catererId: String(c._id), maxStudentCount: c.max ?? 5 })) }
    : {}),
  ...extra,
})

// ---------------------------------------------------------------------------
// Auth wall (one representative request per route group)
// ---------------------------------------------------------------------------

describe("admin dining auth wall", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const cases = [
      ["get", `${BASE}/hostels`],
      ["post", `${BASE}/hostel`],
      ["put", `${BASE}/hostel/000000000000000000000000`],
      ["get", `${BASE}/caterers`],
      ["post", `${BASE}/caterers`],
      ["put", `${BASE}/caterers/000000000000000000000000/archive`],
      ["get", `${BASE}/dining-periods`],
      ["post", `${BASE}/dining-periods`],
      ["put", `${BASE}/dining-periods/000000000000000000000000`],
      ["get", `${BASE}/dining-periods/000000000000000000000000/allocations`],
      ["post", `${BASE}/dining-periods/000000000000000000000000/allocations/bulk`],
      ["delete", `${BASE}/dining-periods/000000000000000000000000/allocations/000000000000000000000000`],
      ["get", `${BASE}/dining-rebates`],
      ["put", `${BASE}/dining-rebates/000000000000000000000000/approve`],
      ["put", `${BASE}/dining-rebates/000000000000000000000000/reject`],
      ["get", `${BASE}/dining-billing-periods`],
      ["post", `${BASE}/dining-billing-periods`],
      ["get", `${BASE}/dining-billing-periods/000000000000000000000000/accounts`],
      ["post", `${BASE}/dining-billing-periods/000000000000000000000000/accounts/bulk`],
      ["get", `${BASE}/dining-office`],
      ["post", `${BASE}/dining-office`],
      ["delete", `${BASE}/dining-office/000000000000000000000000`],
    ]
    for (const [method, url] of cases) {
      const res = await api[method](url).send({})
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(401)
      expect(res.body.success).toBe(false)
    }
  })

  it("403 for student and warden roles on every route group", async () => {
    const student = await seed.student()
    const warden = await seed.warden()
    for (const user of [student, warden]) {
      const api = await as(user)
      const cases = [
        ["get", `${BASE}/hostels`],
        ["post", `${BASE}/caterers`],
        ["post", `${BASE}/dining-periods`],
        ["get", `${BASE}/dining-rebates`],
        ["post", `${BASE}/dining-billing-periods`],
        ["post", `${BASE}/dining-office`],
      ]
      for (const [method, url] of cases) {
        const res = await api[method](url).send({})
        expect(res.status, `${method.toUpperCase()} ${url} as ${user.role}`).toBe(403)
        expect(res.body.success).toBe(false)
        expect(res.body.message).toMatch(/Access denied/i)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Hostel management: GET /hostels, POST /hostel, PUT /hostel/:id
// ---------------------------------------------------------------------------

describe("hostels", () => {
  let createdHostelId

  it("POST /hostel creates a room-only hostel with rooms (201 envelope)", async () => {
    const res = await adminApi.post(`${BASE}/hostel`).send({
      name: "Admin Dining Hostel",
      gender: "Boys",
      type: "room-only",
      rooms: [
        { roomNumber: "ADH-101", capacity: 2 },
        { roomNumber: "ADH-102", capacity: 3 },
      ],
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Hostel added successfully")
    expect(res.body.data.id).toBeTruthy()
    expect(res.body.data.totalRooms).toBe(2)
    createdHostelId = res.body.data.id
  })

  it("POST /hostel validates required fields with 400", async () => {
    // NOTE: the controller error path returns { message } only — no success flag.
    const res = await adminApi.post(`${BASE}/hostel`).send({ name: "No gender or type" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Missing required hostel information")
  })

  it("GET /hostels lists the created hostel with stats", async () => {
    // NOTE: this list endpoint returns the raw array directly (no envelope).
    const res = await adminApi.get(`${BASE}/hostels`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const hostel = res.body.find((h) => h.name === "Admin Dining Hostel")
    expect(hostel).toBeTruthy()
    expect(hostel.type).toBe("room-only")
    expect(hostel.gender).toBe("Boys")
    expect(hostel.totalRooms).toBe(2)
    expect(hostel.isArchived).toBe(false)
    expect(typeof hostel.maintenanceIssues).toBe("number")
  })

  it("PUT /hostel/:id renames the hostel and the change persists", async () => {
    // NOTE: the success response is the raw updated Hostel document — no
    // { success, data } envelope wrapper.
    const res = await adminApi.put(`${BASE}/hostel/${createdHostelId}`).send({
      name: "Admin Dining Hostel Renamed",
      gender: "Girls",
    })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("Admin Dining Hostel Renamed")
    expect(res.body.gender).toBe("Girls")

    const list = await adminApi.get(`${BASE}/hostels`)
    const hostel = list.body.find((h) => String(h.id) === String(createdHostelId))
    expect(hostel.name).toBe("Admin Dining Hostel Renamed")
    expect(hostel.gender).toBe("Girls")
  })

  it("PUT /hostel/:id returns 404 for an unknown hostel", async () => {
    // NOTE: error body carries only { message } — no success flag.
    const res = await adminApi.put(`${BASE}/hostel/000000000000000000000001`).send({
      name: "Ghost",
      gender: "Boys",
    })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Hostel not found")
  })
})

// ---------------------------------------------------------------------------
// Caterer management: GET/POST /caterers, PUT /caterers/:id, PUT archive
// ---------------------------------------------------------------------------

describe("caterers", () => {
  let catererId

  it("POST /caterers creates a caterer with a login (201 envelope)", async () => {
    const email = `admin-caterer-${Date.now()}@hms.test`
    const res = await adminApi.post(`${BASE}/caterers`).send({ name: "Admin Test Mess", email })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Caterer added successfully")
    expect(res.body.data.name).toBe("Admin Test Mess")
    expect(res.body.data.email).toBe(email.toLowerCase())
    expect(res.body.data.isArchived).toBe(false)
    catererId = res.body.data.id
  })

  it("POST /caterers validates the payload with 400", async () => {
    const missing = await adminApi.post(`${BASE}/caterers`).send({ name: "Only Name" })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toBe("Name and email are required")

    const badEmail = await adminApi
      .post(`${BASE}/caterers`)
      .send({ name: "Bad Email Mess", email: "not-an-email" })
    expect(badEmail.status).toBe(400)
    expect(badEmail.body.message).toBe("Please provide a valid caterer email")

    const duplicate = await adminApi
      .post(`${BASE}/caterers`)
      .send({ name: "ADMIN TEST MESS", email: `other-${Date.now()}@hms.test` })
    expect(duplicate.status).toBe(400)
    expect(duplicate.body.message).toBe("A caterer with this name already exists")
  })

  it("POST /caterers conflicts when the login email belongs to a user (409)", async () => {
    const taken = `taken-${Date.now()}@hms.test`
    await seed.createUser({ email: taken, role: "Warden" })
    const res = await adminApi
      .post(`${BASE}/caterers`)
      .send({ name: `Clashing Mess ${Date.now()}`, email: taken })
    expect(res.status).toBe(409)
    expect(res.body.message).toBe("A user with this email already exists")
  })

  it("GET /caterers lists the new caterer in the active view", async () => {
    // NOTE: raw array body, no envelope.
    const res = await adminApi.get(`${BASE}/caterers`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const row = res.body.find((c) => String(c.id) === String(catererId))
    expect(row).toBeTruthy()
    expect(row.name).toBe("Admin Test Mess")
    expect(row.email).toBeTruthy()
    expect(row.isArchived).toBe(false)
  })

  it("PUT /caterers/:id updates name and email; change persists via GET", async () => {
    const newName = "Admin Test Mess Renamed"
    const newEmail = `renamed-caterer-${Date.now()}@hms.test`
    const res = await adminApi.put(`${BASE}/caterers/${catererId}`).send({ name: newName, email: newEmail })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Caterer updated successfully")
    expect(res.body.data.name).toBe(newName)

    const list = await adminApi.get(`${BASE}/caterers`)
    const row = list.body.find((c) => String(c.id) === String(catererId))
    expect(row.name).toBe(newName)
    expect(row.email).toBe(newEmail.toLowerCase())
  })

  it("PUT /caterers/:id rejects duplicates and unknown ids", async () => {
    const other = await createCaterer({ name: "Duplicate Probe Mess" })

    const dup = await adminApi.put(`${BASE}/caterers/${catererId}`).send({
      name: other.name,
      email: `fine-${Date.now()}@hms.test`,
    })
    expect(dup.status).toBe(400)
    expect(dup.body.message).toBe("A caterer with this name already exists")

    const missing = await adminApi.put(`${BASE}/caterers/000000000000000000000002`).send({
      name: "Ghost Mess",
      email: `ghost-${Date.now()}@hms.test`,
    })
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Caterer not found")
  })

  it("PUT /caterers/:id/archive archives then unarchives the caterer", async () => {
    const archive = await adminApi
      .put(`${BASE}/caterers/${catererId}/archive`)
      .send({ status: true })
    expect(archive.status).toBe(200)
    expect(archive.body.success).toBe(true)
    expect(archive.body.message).toBe("Caterer archived successfully")
    expect(archive.body.data.isArchived).toBe(true)

    const defaultList = await adminApi.get(`${BASE}/caterers`)
    expect(defaultList.body.find((c) => String(c.id) === String(catererId))).toBeUndefined()

    const archivedList = await adminApi.get(`${BASE}/caterers`).query({ archive: "true" })
    const row = archivedList.body.find((c) => String(c.id) === String(catererId))
    expect(row).toBeTruthy()
    expect(row.isArchived).toBe(true)

    const unarchive = await adminApi
      .put(`${BASE}/caterers/${catererId}/archive`)
      .send({ status: false })
    expect(unarchive.status).toBe(200)
    expect(unarchive.body.message).toBe("Caterer unarchived successfully")
    expect(unarchive.body.data.isArchived).toBe(false)
  })

  it("PUT /caterers/:id/archive returns 404 for an unknown id", async () => {
    const res = await adminApi
      .put(`${BASE}/caterers/000000000000000000000003/archive`)
      .send({ status: true })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Caterer not found")
  })
})

// ---------------------------------------------------------------------------
// Dining periods CRUD: GET/POST /dining-periods, PUT /:id, PUT /:id/archive
// ---------------------------------------------------------------------------

describe("dining periods", () => {
  let periodId
  let catererX
  let catererY

  beforeAll(async () => {
    catererX = await createCaterer({ name: "Period X Mess" })
    catererY = await createCaterer({ name: "Period Y Mess" })
  })

  it("POST /dining-periods validates the payload with 400", async () => {
    const noDates = await adminApi.post(`${BASE}/dining-periods`).send({})
    expect(noDates.status).toBe(400)
    expect(noDates.message ?? noDates.body.message).toBe("Start date and end date are required")

    const noCaterers = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [] }))
    expect(noCaterers.status).toBe(400)
    expect(noCaterers.body.message).toBe("Please select at least one caterer")

    const badSlots = await adminApi.post(`${BASE}/dining-periods`).send(
      manualPeriodPayload({
        caterers: [catererX],
        mealSlots: [{ name: "Dinner", startTime: "7pm", endTime: "10pm" }],
      }),
    )
    expect(badSlots.status).toBe(400)
    expect(badSlots.body.message).toBe(
      "Each meal verification slot must have a name and valid HH:mm start/end time",
    )

    const capacityGap = await adminApi.post(`${BASE}/dining-periods`).send({
      ...manualPeriodPayload({ caterers: [] }),
      catererIds: [String(catererX._id)],
      catererCapacities: [],
    })
    expect(capacityGap.status).toBe(400)
    expect(capacityGap.body.message).toBe("Please provide maximum student count for each selected caterer")

    const registrationWindow = await adminApi.post(`${BASE}/dining-periods`).send({
      ...manualPeriodPayload({ caterers: [catererX] }),
      registrationEnabled: true,
      allocationStartAt: null,
      allocationEndAt: null,
    })
    expect(registrationWindow.status).toBe(400)
    expect(registrationWindow.body.message).toBe("Allocation start time and end time are required")

    const archivedCaterer = await createCaterer({ name: "Archived Mess" })
    await adminApi.put(`${BASE}/caterers/${archivedCaterer._id}/archive`).send({ status: true })
    const unavailable = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [archivedCaterer] }))
    expect(unavailable.status).toBe(400)
    expect(unavailable.body.message).toBe("One or more selected caterers are unavailable or archived")
  })

  it("POST /dining-periods creates a manual-assignment period (201 envelope)", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [catererX, catererY], dailyRate: 120 }))
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Dining period created successfully")

    const period = res.body.data
    expect(period.id).toBeTruthy()
    expect(period.registrationEnabled).toBe(false)
    expect(period.allocationStatus).toBe("Manual")
    expect(["Upcoming", "Open"]).toContain(period.status)
    expect(period.dailyRate).toBe(120)
    expect(period.caterers.map((c) => c.name).sort()).toEqual(["Period X Mess", "Period Y Mess"])
    expect(period.catererCapacities).toHaveLength(2)
    for (const entry of period.catererCapacities) {
      expect(entry.maxStudentCount).toBe(5)
      expect(entry.allocatedCount).toBe(0)
      expect(entry.remainingSeats).toBe(5)
    }
    expect(period.totalCapacity).toBe(10)
    expect(period.mealSlots.map((s) => s.name)).toEqual(["Dinner"])
    expect(period.rebateSettings.shortTermMaxTotalDays).toBe(10)
    expect(period.eligibilityMode).toBe("all-active")
    periodId = period.id
  })

  it("GET /dining-periods lists the created period", async () => {
    // NOTE: raw array body, no envelope.
    const res = await adminApi.get(`${BASE}/dining-periods`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const row = res.body.find((p) => String(p.id) === String(periodId))
    expect(row).toBeTruthy()
    expect(row.catererCapacities).toHaveLength(2)
    expect(row.totalCapacity).toBe(10)
  })

  it("PUT /dining-periods/:id updates dates/rate/capacity; change persists", async () => {
    const payload = manualPeriodPayload({
      caterers: [catererX, catererY],
      dailyRate: 150,
      endDate: utcDay(14),
    })
    payload.catererCapacities[1].maxStudentCount = 8
    const res = await adminApi.put(`${BASE}/dining-periods/${periodId}`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Dining period updated successfully")
    expect(res.body.data.dailyRate).toBe(150)
    expect(res.body.data.totalCapacity).toBe(13)

    const list = await adminApi.get(`${BASE}/dining-periods`)
    const row = list.body.find((p) => String(p.id) === String(periodId))
    expect(row.dailyRate).toBe(150)
    expect(dayKey(row.endDate)).toBe(dayKey(utcDay(14)))
  })

  it("PUT /dining-periods/:id refuses to drop a caterer that holds allocations with 400", async () => {
    // Assign through the API so the seat counter increments (mirrors prod flow);
    // the removal guard keys off the stored allocatedCount.
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id, rollNumber: "PER001" })
    const assigned = await adminApi
      .post(`${BASE}/dining-periods/${periodId}/allocations`)
      .send({ rollNumber: "PER001", catererId: String(catererX._id) })
    expect(assigned.status).toBe(200)

    const payload = manualPeriodPayload({ caterers: [catererY], dailyRate: 150, endDate: utcDay(14) })
    const res = await adminApi.put(`${BASE}/dining-periods/${periodId}`).send(payload)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(
      "Caterers with existing student allocations cannot be removed from this period",
    )

    // Keeping both caterers works and preserves the stored allocated count.
    const kept = await adminApi.put(`${BASE}/dining-periods/${periodId}`).send(
      manualPeriodPayload({ caterers: [catererX, catererY], dailyRate: 150, endDate: utcDay(14) }),
    )
    expect(kept.status).toBe(200)
    expect(
      kept.body.data.catererCapacities.find((e) => e.catererId === String(catererX._id)).allocatedCount,
    ).toBe(1)
  })

  it("PUT /dining-periods/:id returns 404 for an unknown period", async () => {
    const res = await adminApi
      .put(`${BASE}/dining-periods/000000000000000000000004`)
      .send(manualPeriodPayload({ caterers: [catererX] }))
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Dining period not found")
  })

  it("PUT /dining-periods/:id/archive archives and unarchives the period", async () => {
    const scratch = await createCaterer({ name: "Archive Period Mess" })
    const created = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [scratch], startDate: utcDay(-30), endDate: utcDay(-20) }))
    const scratchPeriodId = created.body.data.id

    const archive = await adminApi
      .put(`${BASE}/dining-periods/${scratchPeriodId}/archive`)
      .send({ status: true })
    expect(archive.status).toBe(200)
    expect(archive.body.message).toBe("Dining period archived successfully")
    expect(archive.body.data.isArchived).toBe(true)
    expect(archive.body.data.status).toBe("Archived")

    const defaultList = await adminApi.get(`${BASE}/dining-periods`)
    expect(defaultList.body.find((p) => String(p.id) === String(scratchPeriodId))).toBeUndefined()

    const archivedList = await adminApi.get(`${BASE}/dining-periods`).query({ archive: "true" })
    const row = archivedList.body.find((p) => String(p.id) === String(scratchPeriodId))
    expect(row).toBeTruthy()
    expect(row.isArchived).toBe(true)

    const unarchive = await adminApi
      .put(`${BASE}/dining-periods/${scratchPeriodId}/archive`)
      .send({ status: false })
    expect(unarchive.status).toBe(200)
    expect(unarchive.body.message).toBe("Dining period unarchived successfully")
  })

  it("PUT /dining-periods/:id/archive returns 404 for an unknown period", async () => {
    const res = await adminApi
      .put(`${BASE}/dining-periods/000000000000000000000005/archive`)
      .send({ status: true })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Dining period not found")
  })
})

// ---------------------------------------------------------------------------
// Allocations: GET/POST /dining-periods/:id/allocations, bulk, reconcile, DELETE
// ---------------------------------------------------------------------------

describe("period allocations", () => {
  let allocPeriodId
  let catererA
  let catererB
  let student2UserId // ADM002

  beforeAll(async () => {
    catererA = await createCaterer({ name: "Alloc A Mess" })
    catererB = await createCaterer({ name: "Alloc B Mess" })
    const created = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(
        manualPeriodPayload({
          caterers: [catererA, catererB],
          startDate: utcDay(-1),
          endDate: utcDay(30),
        }),
      )
    expect(created.status).toBe(201)
    allocPeriodId = created.body.data.id
    // Give B a tighter capacity (2 seats) for the full/force test.
    const resized = manualPeriodPayload({ caterers: [catererA, catererB], endDate: utcDay(30) })
    resized.catererCapacities[1].maxStudentCount = 2
    await adminApi.put(`${BASE}/dining-periods/${allocPeriodId}`).send(resized)

    const rolls = ["ADM001", "ADM002", "ADM003", "ADM004"]
    for (const roll of rolls) {
      const s = await seed.student()
      await createStudentProfile({ userId: s._id, rollNumber: roll })
      if (roll === "ADM002") student2UserId = String(s._id)
    }
  })

  it("GET allocations starts empty with both caterers listed", async () => {
    const res = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.periodId).toBe(String(allocPeriodId))
    expect(res.body.data.totalAssigned).toBe(0)
    expect(res.body.data.hasDrift).toBe(false)
    expect(res.body.data.caterers).toHaveLength(2)
    for (const entry of res.body.data.caterers) {
      expect(entry.students).toEqual([])
      expect(entry.allocatedCount).toBe(0)
      expect(entry.actualCount).toBe(0)
      expect(entry.isFull).toBe(false)
    }
  })

  it("GET allocations returns 404 for an unknown period", async () => {
    const res = await adminApi.get(`${BASE}/dining-periods/000000000000000000000006/allocations`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Dining period not found")
  })

  it("POST allocations validates the payload with 400", async () => {
    const noStudent = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ catererId: String(catererA._id) })
    expect(noStudent.status).toBe(400)
    expect(noStudent.body.message).toBe("Please provide a roll number or student")

    const badRoll = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "NOPE999", catererId: String(catererA._id) })
    expect(badRoll.status).toBe(400)
    expect(badRoll.body.message).toBe("No student found for the given roll number")

    const badCaterer = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM001", catererId: "not-an-objectid" })
    expect(badCaterer.status).toBe(400)
    expect(badCaterer.body.message).toBe("Please select a valid caterer")

    const outsider = await createCaterer({ name: "Alloc Outsider Mess" })
    const notInPeriod = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM001", catererId: String(outsider._id) })
    expect(notInPeriod.status).toBe(400)
    expect(notInPeriod.body.message).toBe("That caterer is not part of this dining period")
  })

  it("POST allocations assigns one student; state visible via GET", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "adm001", catererId: String(catererA._id) }) // lowercase on purpose
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("assigned")
    expect(res.body.data.rollNumber).toBe("ADM001")

    const view = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    const entryA = view.body.data.caterers.find((c) => c.catererId === String(catererA._id))
    expect(entryA.allocatedCount).toBe(1)
    expect(entryA.actualCount).toBe(1)
    expect(entryA.students).toHaveLength(1)
    expect(entryA.students[0].rollNumber).toBe("ADM001")
    expect(entryA.students[0].name).toBeTruthy()
    expect(view.body.data.totalAssigned).toBe(1)
  })

  it("POST allocations is idempotent then moves between caterers", async () => {
    const same = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM001", catererId: String(catererA._id) })
    expect(same.status).toBe(200)
    expect(same.body.data.status).toBe("unchanged")
    expect(same.body.message).toContain("already on this caterer")

    const move = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM001", catererId: String(catererB._id) })
    expect(move.status).toBe(200)
    expect(move.body.data.status).toBe("moved")

    const view = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    const entryA = view.body.data.caterers.find((c) => c.catererId === String(catererA._id))
    const entryB = view.body.data.caterers.find((c) => c.catererId === String(catererB._id))
    expect(entryA.allocatedCount).toBe(0)
    expect(entryB.allocatedCount).toBe(1)
  })

  it("bulk assign reports per-row results and updates counters", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations/bulk`)
      .send({ catererId: String(catererA._id), rollNumbers: ["ADM002", " adm003 ", "GHOST001"] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.summary).toMatchObject({ assigned: 2, unchanged: 0, moved: 0, failed: 1 })
    expect(res.body.data.failures[0]).toMatchObject({
      rollNumber: "GHOST001",
      reason: "No student found with this roll number",
    })

    const view = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    const entryA = view.body.data.caterers.find((c) => c.catererId === String(catererA._id))
    expect(entryA.actualCount).toBe(2)
    expect(view.body.data.totalAssigned).toBe(3) // ADM001@B + ADM002/ADM003@A

    const validation = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations/bulk`)
      .send({ catererId: String(catererA._id), rollNumbers: [] })
    expect(validation.status).toBe(400)
    expect(validation.body.message).toBe("Please provide at least one roll number")
  })

  it("refuses an over-capacity caterer but allows force", async () => {
    // B holds 1 seat (ADM001); capacity is 2 -> one more fits, the next is full.
    const ok = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM004", catererId: String(catererB._id) })
    expect(ok.status).toBe(200)

    const extra = await seed.student()
    await createStudentProfile({ userId: extra._id, rollNumber: "ADM005" })
    const full = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM005", catererId: String(catererB._id) })
    expect(full.status).toBe(400)
    expect(full.body.message).toContain("is full")

    const forced = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
      .send({ rollNumber: "ADM005", catererId: String(catererB._id), force: true })
    expect(forced.status).toBe(200)
    expect(forced.body.data.status).toBe("assigned")
  })

  it("reconcile corrects counter drift from directly-seeded rows", async () => {
    // Seed an allocation row without touching the period's seat counter ->
    // actualCount drifts away from allocatedCount.
    const s = await seed.student()
    await createStudentProfile({ userId: s._id, rollNumber: "ADM006" })
    const profile = await (
      await import("../../../src/models/index.js")
    ).StudentProfile.findOne({ userId: s._id })
    await createDiningAllocation({
      periodId: allocPeriodId,
      studentUserId: s._id,
      studentProfileId: profile._id,
      rollNumber: "ADM006",
      catererId: catererA._id,
    })

    const drifted = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    expect(drifted.body.data.hasDrift).toBe(true)

    const reconcile = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations/reconcile`)
      .send({})
    expect(reconcile.status).toBe(200)
    expect(reconcile.body.success).toBe(true)
    expect(reconcile.body.data.changed).toBeGreaterThanOrEqual(1)

    const fixed = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    expect(fixed.body.data.hasDrift).toBe(false)
    for (const entry of fixed.body.data.caterers) {
      expect(entry.allocatedCount).toBe(entry.actualCount)
      expect(entry.countDrift).toBe(false)
    }

    const again = await adminApi
      .post(`${BASE}/dining-periods/${allocPeriodId}/allocations/reconcile`)
      .send({})
    expect(again.status).toBe(200)
    expect(again.body.message).toBe("Seat counts already correct")
  })

  it("DELETE allocation removes the student; repeat removal is 404", async () => {
    const res = await adminApi.delete(
      `${BASE}/dining-periods/${allocPeriodId}/allocations/${student2UserId}`,
    )
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student removed from the period")

    const view = await adminApi.get(`${BASE}/dining-periods/${allocPeriodId}/allocations`)
    expect(view.body.data.totalAssigned).toBe(5) // 6 rows minus ADM002
    const entryA = view.body.data.caterers.find((c) => c.catererId === String(catererA._id))
    expect(entryA.students.find((row) => row.rollNumber === "ADM002")).toBeUndefined()

    const again = await adminApi.delete(
      `${BASE}/dining-periods/${allocPeriodId}/allocations/${student2UserId}`,
    )
    expect(again.status).toBe(404)
    expect(again.body.message).toBe("Student allocation not found")
  })
})

// ---------------------------------------------------------------------------
// Rebate review: GET /dining-rebates, PUT /:id/approve, PUT /:id/reject
// ---------------------------------------------------------------------------

describe("dining rebate review", () => {
  let pendingApproveId
  let pendingRejectId

  beforeAll(async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "ADMR001" })
    const caterer = await createCaterer({ name: "Review Mess" })
    const period = await createDiningPeriod({
      eligibilityMode: "all-active",
      catererIds: [caterer._id],
      catererCapacities: [{ catererId: caterer._id, maxStudentCount: 5, allocatedCount: 0 }],
      startDate: utcDay(-5),
      endDate: utcDay(20),
    })
    const profile = await (
      await import("../../../src/models/index.js")
    ).StudentProfile.findOne({ userId: student._id })
    await createDiningAllocation({
      periodId: period._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "ADMR001",
      catererId: caterer._id,
    })

    const { DiningRebate } = await import("../../../src/models/index.js")
    const mkRebate = (suffix, startOffset, endOffset) =>
      DiningRebate.create({
        requestGroupId: `admin-review-${suffix}-${Date.now()}`,
        periodId: period._id,
        catererId: caterer._id,
        studentUserId: student._id,
        studentProfileId: profile._id,
        rollNumber: "ADMR001",
        startDate: utcDay(startOffset),
        endDate: utcDay(endOffset),
        dateKeys: [dayKey(utcDay(startOffset)), dayKey(utcDay(endOffset))],
        dayCount: endOffset - startOffset + 1,
        type: "long-term",
        status: "pending",
        reason: `Admin review ${suffix}`,
      })

    pendingApproveId = String((await mkRebate("approve", 10, 12))._id)
    pendingRejectId = String((await mkRebate("reject", 14, 15))._id)
  })

  it("GET /dining-rebates lists pending requests with serialization", async () => {
    const res = await adminApi.get(`${BASE}/dining-rebates`).query({ status: "pending" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.rebates)).toBe(true)

    const mine = res.body.data.rebates.filter((r) =>
      [pendingApproveId, pendingRejectId].includes(String(r.id)),
    )
    expect(mine).toHaveLength(2)
    for (const rebate of mine) {
      expect(rebate.status).toBe("pending")
      expect(rebate.type).toBe("long-term")
      expect(rebate.rollNumber).toBe("ADMR001")
      expect(rebate.period.id).toBeTruthy()
      expect(rebate.caterer.name).toBe("Review Mess")
    }
  })

  it("PUT /:id/approve approves a pending long-term rebate", async () => {
    const res = await adminApi.put(`${BASE}/dining-rebates/${pendingApproveId}/approve`).send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Rebate approved successfully")
    expect(res.body.data.rebate.status).toBe("approved")
    expect(res.body.data.rebate.approvedAt).toBeTruthy()

    // State change visible through the list API.
    const list = await adminApi.get(`${BASE}/dining-rebates`).query({ status: "approved" })
    expect(list.body.data.rebates.some((r) => String(r.id) === pendingApproveId)).toBe(true)

    // Approving again is refused — only pending rebates can be approved.
    const repeat = await adminApi.put(`${BASE}/dining-rebates/${pendingApproveId}/approve`).send({})
    expect(repeat.status).toBe(400)
    expect(repeat.body.message).toBe("Only pending long-term rebates can be approved")
  })

  it("PUT /:id/reject rejects a pending long-term rebate with a comment", async () => {
    const res = await adminApi
      .put(`${BASE}/dining-rebates/${pendingRejectId}/reject`)
      .send({ comment: "Insufficient documentation" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Rebate rejected successfully")
    expect(res.body.data.rebate.status).toBe("rejected")
    expect(res.body.data.rebate.adminComment).toBe("Insufficient documentation")
    expect(res.body.data.rebate.rejectedAt).toBeTruthy()

    const list = await adminApi.get(`${BASE}/dining-rebates`).query({ status: "rejected" })
    const row = list.body.data.rebates.find((r) => String(r.id) === pendingRejectId)
    expect(row).toBeTruthy()
    expect(row.adminComment).toBe("Insufficient documentation")
  })

  it("approve/reject validate ids and 404 on unknown rebates", async () => {
    const badId = await adminApi.put(`${BASE}/dining-rebates/not-an-id/approve`).send({})
    expect(badId.status).toBe(400)
    expect(badId.message ?? badId.body.message).toBe("Invalid rebate request")

    const missingApprove = await adminApi
      .put(`${BASE}/dining-rebates/000000000000000000000007/approve`)
      .send({})
    expect(missingApprove.status).toBe(404)
    expect(missingApprove.body.message).toBe("Dining rebate not found")

    const missingReject = await adminApi
      .put(`${BASE}/dining-rebates/000000000000000000000008/reject`)
      .send({})
    expect(missingReject.status).toBe(404)
    expect(missingReject.body.message).toBe("Dining rebate not found")
  })
})

// ---------------------------------------------------------------------------
// Billing: GET/POST /dining-billing-periods, PUT /:id, /:id/archive,
// GET /:id/accounts, POST /:id/accounts/bulk
// ---------------------------------------------------------------------------

describe("dining billing periods", () => {
  let billingPeriodId
  let allocPeriodId

  beforeAll(async () => {
    // Reuse the allocations describe's period (it holds ADM001..ADM006 rows).
    const list = await adminApi.get(`${BASE}/dining-periods`)
    const period = list.body.find((p) => p.caterers.some((c) => c.name === "Alloc A Mess"))
    allocPeriodId = period.id
  })

  it("POST /dining-billing-periods validates the payload with 400", async () => {
    const noName = await adminApi.post(`${BASE}/dining-billing-periods`).send({})
    expect(noName.status).toBe(400)
    expect(noName.body.message).toBe("Billing period name is required")

    const ghostPeriod = await adminApi.post(`${BASE}/dining-billing-periods`).send({
      name: "Ghost cycle",
      diningPeriodIds: ["000000000000000000000009"],
    })
    expect(ghostPeriod.status).toBe(400)
    expect(ghostPeriod.body.message).toBe("One or more selected dining periods do not exist")
  })

  it("POST /dining-billing-periods creates a period referencing dining periods", async () => {
    const res = await adminApi.post(`${BASE}/dining-billing-periods`).send({
      name: "Admin Dining Cycle",
      note: "integration test cycle",
      diningPeriodIds: [String(allocPeriodId)],
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Billing period created successfully")

    const data = res.body.data
    expect(data.id).toBeTruthy()
    expect(data.name).toBe("Admin Dining Cycle")
    expect(data.note).toBe("integration test cycle")
    expect(data.diningPeriodIds).toEqual([String(allocPeriodId)])
    expect(data.isArchived).toBe(false)
    // The contained dining period is serialized with its money fields.
    expect(data.diningPeriods[0].id).toBe(String(allocPeriodId))
    expect(typeof data.diningPeriods[0].dailyRate).toBe("number")
    billingPeriodId = data.id
  })

  it("GET /dining-billing-periods lists it with a computed summary", async () => {
    // NOTE: raw array body, no envelope.
    const res = await adminApi.get(`${BASE}/dining-billing-periods`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const row = res.body.find((p) => String(p.id) === String(billingPeriodId))
    expect(row).toBeTruthy()
    expect(row.summary.studentCount).toBeGreaterThanOrEqual(5) // allocation-union students
    expect(typeof row.summary.totalAllocated).toBe("number")
  })

  it("PUT /dining-billing-periods/:id renames the period; change persists", async () => {
    const res = await adminApi.put(`${BASE}/dining-billing-periods/${billingPeriodId}`).send({
      name: "Admin Dining Cycle Renamed",
      note: "updated note",
      diningPeriodIds: [String(allocPeriodId)],
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Billing period updated successfully")
    expect(res.body.data.name).toBe("Admin Dining Cycle Renamed")
    expect(res.body.data.note).toBe("updated note")

    const list = await adminApi.get(`${BASE}/dining-billing-periods`)
    const row = list.body.find((p) => String(p.id) === String(billingPeriodId))
    expect(row.name).toBe("Admin Dining Cycle Renamed")
  })

  it("PUT returns 400/404 for invalid and unknown ids", async () => {
    const bad = await adminApi.put(`${BASE}/dining-billing-periods/not-an-id`).send({ name: "X" })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe("Invalid billing period")

    const missing = await adminApi
      .put(`${BASE}/dining-billing-periods/00000000000000000000000a`)
      .send({ name: "Ghost" })
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Billing period not found")
  })

  it("GET /:id/accounts lists every participating student with derived charges", async () => {
    const res = await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const { billingPeriod, accounts } = res.body.data
    expect(String(billingPeriod.id)).toBe(String(billingPeriodId))

    // Students come from the union of allocations + accounts; all six seeded
    // rolls are allocated, so they must appear even before any funds exist.
    const rolls = accounts.map((a) => a.rollNumber).sort()
    for (const roll of ["ADM001", "ADM003", "ADM004", "ADM005", "ADM006"]) {
      expect(rolls).toContain(roll)
    }

    const adm = accounts.find((a) => a.rollNumber === "ADM001")
    expect(adm.accountId).toBeNull() // no funds applied yet
    expect(adm.allocatedAmount).toBe(0)
    expect(adm.adjustmentCount).toBe(0)
    // Charges derive from elapsed days x dailyRate of the contained period.
    expect(adm.totalCharged).toBeGreaterThanOrEqual(0)
    expect(adm.balance).toBeCloseTo(adm.allocatedAmount - adm.totalCharged, 2)
    expect(adm.clearance).toBe(adm.balance >= 0 ? "cleared" : "dues")

    const missing = await adminApi
      .get(`${BASE}/dining-billing-periods/00000000000000000000000b/accounts`)
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Billing period not found")
  })

  it("POST /:id/accounts/bulk validates mode and entries with 400", async () => {
    const badMode = await adminApi
      .post(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts/bulk`)
      .send({ mode: "multiply", entries: [{ rollNumber: "ADM001", amount: 1 }] })
    expect(badMode.status).toBe(400)
    expect(badMode.body.message).toBe("Invalid mode. Use add, deduct, or set")

    const empty = await adminApi
      .post(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts/bulk`)
      .send({ mode: "add", entries: [] })
    expect(empty.status).toBe(400)
    expect(empty.body.message).toBe("Please provide at least one row")

    const missing = await adminApi
      .post(`${BASE}/dining-billing-periods/00000000000000000000000c/accounts/bulk`)
      .send({ mode: "add", entries: [{ rollNumber: "ADM001", amount: 1 }] })
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Billing period not found")
  })

  it("POST /:id/accounts/bulk add/deduct/set updates accounts atomically", async () => {
    const bulk = (mode, entries) =>
      adminApi.post(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts/bulk`).send({
        mode,
        entries,
      })

    // One good row + one unknown roll -> skipped.
    const add = await bulk("add", [
      { rollNumber: "adm001", amount: 500 }, // lowercase roll normalizes up
      { rollNumber: "GHOST999", amount: 10 },
      { rollNumber: "ADM003", amount: -5 },
    ])
    expect(add.status).toBe(200)
    expect(add.body.success).toBe(true)
    expect(add.body.data.updated).toBe(1)
    expect(add.body.data.skipped).toHaveLength(2)
    expect(add.body.data.skipped.map((s) => s.reason)).toEqual([
      "Roll number not found",
      "Invalid amount",
    ])
    expect(add.body.message).toContain("1 account(s) updated, 2 skipped")

    let accounts = (
      await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    ).body.data.accounts
    let adm = accounts.find((a) => a.rollNumber === "ADM001")
    expect(adm.allocatedAmount).toBe(500)
    expect(adm.adjustmentCount).toBe(1)
    expect(adm.accountId).toBeTruthy()

    const deduct = await bulk("deduct", [{ rollNumber: "ADM001", amount: 150 }])
    expect(deduct.status).toBe(200)
    accounts = (await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`))
      .body.data.accounts
    adm = accounts.find((a) => a.rollNumber === "ADM001")
    expect(adm.allocatedAmount).toBe(350)
    expect(adm.adjustmentCount).toBe(2)

    const set = await bulk("set", [{ rollNumber: "ADM001", amount: 1000.5 }])
    expect(set.status).toBe(200)
    accounts = (await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`))
      .body.data.accounts
    adm = accounts.find((a) => a.rollNumber === "ADM001")
    expect(adm.allocatedAmount).toBe(1000.5)
    expect(adm.balance).toBeCloseTo(1000.5 - adm.totalCharged, 2)

    // Summary aggregates across every account row.
    const detail = await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    expect(detail.body.data.billingPeriod.summary.totalAllocated).toBeCloseTo(
      detail.body.data.accounts.reduce((sum, a) => sum + a.allocatedAmount, 0),
      2,
    )
  })

  it("archived billing periods refuse fund changes; archive toggles work", async () => {
    const archive = await adminApi
      .put(`${BASE}/dining-billing-periods/${billingPeriodId}/archive`)
      .send({ status: true })
    expect(archive.status).toBe(200)
    expect(archive.body.message).toBe("Billing period archived successfully")
    expect(archive.body.data.isArchived).toBe(true)

    const defaultList = await adminApi.get(`${BASE}/dining-billing-periods`)
    expect(defaultList.body.find((p) => String(p.id) === String(billingPeriodId))).toBeUndefined()

    const archivedList = await adminApi.get(`${BASE}/dining-billing-periods`).query({ archive: "true" })
    expect(
      archivedList.body.find((p) => String(p.id) === String(billingPeriodId))?.isArchived,
    ).toBe(true)

    const blocked = await adminApi
      .post(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts/bulk`)
      .send({ mode: "add", entries: [{ rollNumber: "ADM001", amount: 100 }] })
    expect(blocked.status).toBe(400)
    expect(blocked.body.message).toBe("Cannot modify funds for an archived billing period")

    const unarchive = await adminApi
      .put(`${BASE}/dining-billing-periods/${billingPeriodId}/archive`)
      .send({ status: false })
    expect(unarchive.status).toBe(200)
    expect(unarchive.body.message).toBe("Billing period unarchived successfully")
  })

  it("PUT archive returns 404 for an unknown billing period", async () => {
    const res = await adminApi
      .put(`${BASE}/dining-billing-periods/00000000000000000000000d/archive`)
      .send({ status: true })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Billing period not found")
  })
})

// ---------------------------------------------------------------------------
// Dining office staff: GET/POST /dining-office, PUT /:id, DELETE /:id
// ---------------------------------------------------------------------------

describe("dining office staff", () => {
  let staffId
  let staffEmail

  it("POST /dining-office creates a Dining/Office login", async () => {
    staffEmail = `office-staff-${Date.now()}@hms.test`
    // NOTE: success responses carry only { message } — no success flag or data.
    const res = await adminApi.post(`${BASE}/dining-office`).send({
      name: "Dining Warden One",
      email: staffEmail,
      password: "S3curePass!",
      category: "Dining Warden",
      phone: "9999999999",
    })
    expect(res.status).toBe(201)
    expect(res.body.message).toBe("Dining office login created successfully")
  })

  it("POST /dining-office validates payload and duplicate emails", async () => {
    const missing = await adminApi
      .post(`${BASE}/dining-office`)
      .send({ name: "No Password", email: `x-${Date.now()}@hms.test` })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toBe("Name, email, and password are required")

    const badCategory = await adminApi.post(`${BASE}/dining-office`).send({
      name: "Bad Category",
      email: `y-${Date.now()}@hms.test`,
      password: "S3curePass!",
      category: "Chef",
    })
    expect(badCategory.status).toBe(400)
    expect(badCategory.body.message).toContain("Category must be one of:")

    const duplicate = await adminApi.post(`${BASE}/dining-office`).send({
      name: "Dup Email",
      email: staffEmail.toUpperCase(),
      password: "S3curePass!",
      category: "Dining Hall Supervisor",
    })
    expect(duplicate.status).toBe(400)
    expect(duplicate.body.message).toBe("A user with this email already exists")
  })

  it("GET /dining-office lists the created login", async () => {
    // NOTE: raw array body, no envelope.
    const res = await adminApi.get(`${BASE}/dining-office`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const row = res.body.find((s) => s.email === staffEmail)
    expect(row).toBeTruthy()
    expect(row.name).toBe("Dining Warden One")
    expect(row.category).toBe("Dining Warden")
    expect(row.status).toBe("active")
    expect(row.userId).toBeTruthy()
    expect(typeof row.joinDate).toBe("string")
    expect(row.joinDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    staffId = row.id
  })

  it("PUT /dining-office/:id updates name/category/status; change persists", async () => {
    const res = await adminApi.put(`${BASE}/dining-office/${staffId}`).send({
      name: "Dining Warden One Updated",
      phone: "8888888888",
      category: "Dining Hall Supervisor",
      status: "inactive",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Dining office login updated successfully")

    const list = await adminApi.get(`${BASE}/dining-office`)
    const row = list.body.find((s) => s.email === staffEmail)
    expect(row.name).toBe("Dining Warden One Updated")
    expect(row.category).toBe("Dining Hall Supervisor")
    expect(row.status).toBe("inactive")

    const noData = await adminApi.put(`${BASE}/dining-office/${staffId}`).send({})
    expect(noData.status).toBe(400)
    expect(noData.body.message).toBe("No update data provided")

    const badCategory = await adminApi
      .put(`${BASE}/dining-office/${staffId}`)
      .send({ category: "Chef" })
    expect(badCategory.status).toBe(400)
    expect(badCategory.body.message).toContain("Category must be one of:")
  })

  it("PUT /dining-office/:id returns 404 for an unknown id", async () => {
    const res = await adminApi
      .put(`${BASE}/dining-office/00000000000000000000000e`)
      .send({ name: "Ghost" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Dining office login not found")
  })

  it("DELETE /dining-office/:id removes the login and its user; repeat is 404", async () => {
    // NOTE: success responses carry only { message } — no success flag.
    const res = await adminApi.delete(`${BASE}/dining-office/${staffId}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Dining office login deleted successfully")

    const list = await adminApi.get(`${BASE}/dining-office`)
    expect(list.body.find((s) => s.email === staffEmail)).toBeUndefined()

    const again = await adminApi.delete(`${BASE}/dining-office/${staffId}`)
    expect(again.status).toBe(404)
    expect(again.body.message).toBe("Dining office login not found")
  })
})

// ---------------------------------------------------------------------------
// Hardening additions — period date validation, archive/assign flows,
// bulk dedupe, reconcile idempotency, billing bulk mixed rows.
// ---------------------------------------------------------------------------

describe("dining period date validation and overlap rules", () => {
  let caterer

  beforeAll(async () => {
    caterer = await createCaterer({ name: "DateVal Mess" })
  })

  it("400 when startDate is after endDate", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(10), endDate: utcDay(1) }))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Start date must be before or equal to end date")
  })

  it("400 when the self-registration window starts after it ends", async () => {
    const res = await adminApi.post(`${BASE}/dining-periods`).send({
      ...manualPeriodPayload({ caterers: [caterer] }),
      registrationEnabled: true,
      allocationStartAt: utcDay(5),
      allocationEndAt: utcDay(2),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Allocation start time must be before or equal to allocation end time")
  })

  it("400 on unparseable dates", async () => {
    const res = await adminApi.post(`${BASE}/dining-periods`).send(
      manualPeriodPayload({ caterers: [caterer], startDate: "not-a-date", endDate: utcDay(5) }),
    )
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Start date and end date are required")
  })

  it("equal start/end (single-day period) is accepted at the boundary", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(21), endDate: utcDay(21) }))
    expect(res.status).toBe(201)

    const list = await adminApi.get(`${BASE}/dining-periods`)
    const row = list.body.find((p) => String(p.id) === String(res.body.data.id))
    expect(dayKey(row.startDate)).toBe(dayKey(row.endDate))
  })

  // SUSPECTED BUG (missing constraint): nothing prevents two active periods
  // from overlapping in time while sharing the same caterer, so a student
  // could be double-charged for the same days across both periods.
  it("overlapping periods sharing a caterer are both created — no overlap enforcement (documents current behavior)", async () => {
    const shared = await createCaterer({ name: "Overlap Mess" })
    const first = await adminApi.post(`${BASE}/dining-periods`).send(
      manualPeriodPayload({ caterers: [shared], startDate: utcDay(30), endDate: utcDay(40) }),
    )
    expect(first.status).toBe(201)

    const second = await adminApi.post(`${BASE}/dining-periods`).send(
      manualPeriodPayload({ caterers: [shared], startDate: utcDay(35), endDate: utcDay(45) }),
    )
    expect(second.status).toBe(201)
    expect(String(second.body.data.id)).not.toBe(String(first.body.data.id))
  })
})

describe("caterer archive-then-assign flow", () => {
  let periodId
  let caterer

  beforeAll(async () => {
    caterer = await createCaterer({ name: "Archive Flow Mess" })
    const created = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(-1), endDate: utcDay(50) }))
    expect(created.status).toBe(201)
    periodId = created.body.data.id

    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "ARCH001" })
  })

  it("assigning to an already-archived caterer inside a live period still succeeds", async () => {
    const archived = await adminApi.put(`${BASE}/caterers/${caterer._id}/archive`).send({ status: true })
    expect(archived.status).toBe(200)
    expect(archived.body.data.isArchived).toBe(true)

    // SUSPECTED BUG (guard gap): assignStudent only checks that the caterer is
    // part of the period, never that the caterer is still active. Archiving a
    // caterer mid-period does not stop new assignments to it.
    const assigned = await adminApi
      .post(`${BASE}/dining-periods/${periodId}/allocations`)
      .send({ rollNumber: "ARCH001", catererId: String(caterer._id) })
    expect(assigned.status).toBe(200)
    expect(assigned.body.data.status).toBe("assigned")
  })

  it("unarchiving restores the caterer for NEW periods", async () => {
    const unarchive = await adminApi.put(`${BASE}/caterers/${caterer._id}/archive`).send({ status: false })
    expect(unarchive.status).toBe(200)
    expect(unarchive.body.data.isArchived).toBe(false)

    const recreated = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(60), endDate: utcDay(70) }))
    expect(recreated.status).toBe(201)
  })
})

describe("bulk allocation duplicate-row handling", () => {
  let periodId
  let caterer

  beforeAll(async () => {
    caterer = await createCaterer({ name: "Bulk Dup Mess" })
    const created = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(-1), endDate: utcDay(55) }))
    expect(created.status).toBe(201)
    periodId = created.body.data.id

    for (const roll of ["BDUP001", "BDUP002"]) {
      const s = await seed.student()
      await createStudentProfile({ userId: s._id, rollNumber: roll })
    }
  })

  it("case/whitespace variants of the same roll number collapse into one assignment", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods/${periodId}/allocations/bulk`)
      .send({ catererId: String(caterer._id), rollNumbers: ["BDUP001", "bdup001", " BDUP001 "] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.summary).toMatchObject({ assigned: 1, unchanged: 0, moved: 0, failed: 0 })
    expect(res.body.data.failures).toEqual([])
    expect(res.body.message).toContain("Assigned 1 student")

    const view = await adminApi.get(`${BASE}/dining-periods/${periodId}/allocations`)
    const entry = view.body.data.caterers.find((c) => c.catererId === String(caterer._id))
    expect(entry.students.filter((row) => row.rollNumber === "BDUP001")).toHaveLength(1)
    expect(entry.actualCount).toBe(1)
  })

  it("a duplicated unknown roll number is reported exactly once as failed", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods/${periodId}/allocations/bulk`)
      .send({ catererId: String(caterer._id), rollNumbers: ["BDUP002", "GHOSTDUP", "ghostdup"] })
    expect(res.status).toBe(200)
    expect(res.body.data.summary).toMatchObject({ assigned: 1, failed: 1 })
    expect(res.body.data.failures).toHaveLength(1)
    expect(res.body.data.failures[0]).toMatchObject({
      rollNumber: "GHOSTDUP",
      reason: "No student found with this roll number",
    })
  })
})

describe("reconcile idempotency on consistent data", () => {
  let periodId
  let caterer

  beforeAll(async () => {
    caterer = await createCaterer({ name: "Reconcile Clean Mess" })
    const created = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(-1), endDate: utcDay(60) }))
    expect(created.status).toBe(201)
    periodId = created.body.data.id

    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "RECON001" })
    // assign through the API so counters are consistent by construction
    const assigned = await adminApi
      .post(`${BASE}/dining-periods/${periodId}/allocations`)
      .send({ rollNumber: "RECON001", catererId: String(caterer._id) })
    expect(assigned.status).toBe(200)
  })

  it("reconcile on drift-free data changes nothing and stays idempotent", async () => {
    const before = await adminApi.get(`${BASE}/dining-periods/${periodId}/allocations`)
    expect(before.body.data.hasDrift).toBe(false)

    const res = await adminApi.post(`${BASE}/dining-periods/${periodId}/allocations/reconcile`).send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.changed).toBe(0)
    expect(res.body.message).toBe("Seat counts already correct")

    const after = await adminApi.get(`${BASE}/dining-periods/${periodId}/allocations`)
    expect(after.body.data.hasDrift).toBe(false)
    expect(after.body.data.totalAssigned).toBe(before.body.data.totalAssigned)
    for (const entry of after.body.data.caterers) {
      expect(entry.countDrift).toBe(false)
      expect(entry.allocatedCount).toBe(entry.actualCount)
    }
  })

  it("reconcile returns 404 for an unknown period", async () => {
    const res = await adminApi
      .post(`${BASE}/dining-periods/00000000000000000000000f/allocations/reconcile`)
      .send({})
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/Dining period not found/)
  })
})

describe("billing accounts bulk with mixed valid/invalid rows", () => {
  let billingPeriodId
  let studentUserId

  beforeAll(async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "BILMIX01" })
    studentUserId = String(student._id)

    const caterer = await createCaterer({ name: "Billing Mix Mess" })
    const period = await adminApi
      .post(`${BASE}/dining-periods`)
      .send(manualPeriodPayload({ caterers: [caterer], startDate: utcDay(-1), endDate: utcDay(65) }))
    expect(period.status).toBe(201)
    const diningPeriodId = period.body.data.id

    const created = await adminApi.post(`${BASE}/dining-billing-periods`).send({
      name: `Mixed Rows Cycle ${Date.now()}`,
      diningPeriodIds: [String(diningPeriodId)],
    })
    expect(created.status).toBe(201)
    billingPeriodId = created.body.data.id
  })

  const bulk = (mode, entries) =>
    adminApi.post(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts/bulk`).send({ mode, entries })

  it("skips blank rolls, NaN amounts and negatives while applying valid rows", async () => {
    const res = await bulk("add", [
      { rollNumber: "", amount: 100 }, // missing roll -> '(blank)'
      { rollNumber: "BILMIX01", amount: "not-a-number" }, // NaN
      { rollNumber: "BILMIX01", amount: -50 }, // negative
      { rollNumber: " bilmix01 ", amount: 250 }, // normalized + applied
    ])
    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(1)
    expect(res.body.data.total).toBe(4)
    expect(res.body.data.skipped.map((s) => `${s.rollNumber}: ${s.reason}`)).toEqual([
      "(blank): Missing roll number",
      "BILMIX01: Invalid amount",
      "BILMIX01: Invalid amount",
    ])

    const accounts = (
      await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    ).body.data.accounts
    const mine = accounts.find((a) => String(a.studentUserId) === studentUserId)
    expect(mine.allocatedAmount).toBe(250)
    expect(mine.adjustmentCount).toBe(1)
  })

  it("duplicate rows are each applied (add accumulates twice)", async () => {
    const res = await bulk("add", [
      { rollNumber: "BILMIX01", amount: 10 },
      { rollNumber: "BILMIX01", amount: 15 },
    ])
    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(2)

    const accounts = (
      await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    ).body.data.accounts
    const mine = accounts.find((a) => String(a.studentUserId) === studentUserId)
    expect(mine.allocatedAmount).toBe(275) // 250 + 10 + 15
    expect(mine.adjustmentCount).toBe(3)
  })

  // SUSPECTED BUG (no floor): deducting more than the allocated pot is allowed,
  // driving allocatedAmount negative; balance/clearance then report 'dues'
  // against money that was never there rather than refusing the deduction.
  it("deduct below zero drives the account negative (documents current behavior)", async () => {
    const res = await bulk("deduct", [{ rollNumber: "BILMIX01", amount: 10000 }])
    expect(res.status).toBe(200)
    expect(res.body.data.updated).toBe(1)

    const detail = await adminApi.get(`${BASE}/dining-billing-periods/${billingPeriodId}/accounts`)
    const mine = detail.body.data.accounts.find((a) => String(a.studentUserId) === studentUserId)
    expect(mine.allocatedAmount).toBeLessThan(0)
    expect(mine.clearance).toBe("dues")
  })
})

describe("rebate review — non-CWO admin subrole", () => {
  let rebateId
  let subrolledAdminApi

  beforeAll(async () => {
    // Admin with an operations subRole that is NOT Chief Warden / CWO.
    const subrolledAdmin = await seed.admin({ subRole: "HCU" })
    subrolledAdminApi = await as(subrolledAdmin)

    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "SUBR001" })
    const caterer = await createCaterer({ name: "SubRole Rebate Mess" })
    const profile = await (
      await import("../../../src/models/index.js")
    ).StudentProfile.findOne({ userId: student._id })
    const period = await createDiningPeriod({
      eligibilityMode: "all-active",
      catererIds: [caterer._id],
      catererCapacities: [{ catererId: caterer._id, maxStudentCount: 5, allocatedCount: 0 }],
      startDate: utcDay(-2),
      endDate: utcDay(20),
    })
    const { DiningRebate } = await import("../../../src/models/index.js")
    rebateId = String(
      (
        await DiningRebate.create({
          requestGroupId: `subrole-rebate-${Date.now()}`,
          periodId: period._id,
          catererId: caterer._id,
          studentUserId: student._id,
          studentProfileId: profile._id,
          rollNumber: "SUBR001",
          startDate: utcDay(5),
          endDate: utcDay(6),
          dateKeys: [dayKey(utcDay(5)), dayKey(utcDay(6))],
          dayCount: 2,
          type: "long-term",
          status: "pending",
          reason: "SubRole gate probe",
        })
      )._id,
    )
  })

  it("an Admin without a CWO/Chief Warden subrole can approve rebates (route checks role only)", async () => {
    const res = await subrolledAdminApi.put(`${BASE}/dining-rebates/${rebateId}/approve`).send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Rebate approved successfully")
    expect(res.body.data.rebate.status).toBe("approved")

    // visible through the standard admin list endpoint
    const list = await adminApi.get(`${BASE}/dining-rebates`).query({ status: "approved" })
    expect(list.body.data.rebates.some((r) => String(r.id) === rebateId)).toBe(true)
  })
})
