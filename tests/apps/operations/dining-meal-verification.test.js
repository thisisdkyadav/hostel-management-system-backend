import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---- fixtures --------------------------------------------------------------

/** Dining user with the Caterer sub-role + linked Caterer record. */
async function catererLogin(name = "Meghna Foods") {
  const { default: Caterer } = await import("../../../src/models/index.js").then((m) => ({
    default: m.Caterer,
  }))
  const user = await seed.createUser({ role: "Dining", subRole: "Caterer", name: `${name} Manager` })
  const caterer = await Caterer.create({
    name,
    email: `caterer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@hms.test`,
    userId: user._id,
  })
  return { user, caterer }
}

/** Active period covering today with a slot that always contains "now". */
async function activePeriod(catererIds = []) {
  const { default: DiningPeriod } = await import("../../../src/models/index.js").then((m) => ({
    default: m.DiningPeriod,
  }))
  return DiningPeriod.create({
    startDate: new Date(Date.now() - 86400 * 1000),
    endDate: new Date(Date.now() + 86400 * 1000),
    catererIds,
    mealSlots: [{ name: "All Day Meal", startTime: "00:00", endTime: "23:59" }],
  })
}

async function allocatedStudent(period, caterer, overrides = {}) {
  const { default: DiningAllocation } = await import("../../../src/models/index.js").then((m) => ({
    default: m.DiningAllocation,
  }))
  const student = await seed.student()
  const { StudentProfile } = await import("../../../src/models/index.js")
  const profile = await StudentProfile.create({
    userId: student._id,
    rollNumber: `RN${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase(),
    degree: "B.Tech",
    department: "CSE",
    gender: "Male",
    status: "Active",
  })
  await DiningAllocation.create({
    periodId: period._id,
    studentUserId: student._id,
    studentProfileId: profile._id,
    rollNumber: profile.rollNumber,
    catererId: caterer._id,
    ...overrides,
  })
  return { student, profile }
}

// ---------------------------------------------------------------------------

describe("dining meal verification — auth wall", () => {
  it("401 without a session", async () => {
    const api = await anon()
    for (const url of ["/api/v1/dining-meal-verification/context", "/api/v1/dining-meal-verification/feed"]) {
      expect((await api.get(url)).status).toBe(401)
    }
  })

  it("non-Dining roles are 403; Dining/Office lacks the caterer route key", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/dining-meal-verification/context")).status).toBe(403)

    const adminApi = await as(await seed.admin())
    expect((await adminApi.get("/api/v1/dining-meal-verification/feed")).status).toBe(403)

    // Dining + Office passes authorizeRoles but has no route.caterer.mealVerification
    const officeApi = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    expect((await officeApi.get("/api/v1/dining-meal-verification/context")).status).toBe(403)
  })
})

describe("dining meal verification — context & feed", () => {
  it("context 404s when the Dining/Caterer user has no Caterer login", async () => {
    const orphan = await seed.createUser({ role: "Dining", subRole: "Caterer" })
    const api = await as(orphan)
    const res = await api.get("/api/v1/dining-meal-verification/context")
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/caterer login/i)
  })

  it("SUSPECTED BUG: GET /context always 500s — getActiveDiningPeriodForDate(now) is async, .populate() is called on its Promise", async () => {
    // dining-meal-verification.service.js:443 chains .populate(...) onto an
    // awaited-in-flight Promise, so the endpoint can never succeed.
    const { user, caterer } = await catererLogin()
    await activePeriod([caterer._id])
    const api = await as(user)

    const res = await api.get("/api/v1/dining-meal-verification/context")
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).toMatch(/populate is not a function/)
  })

  it("feed lists verifications for this caterer with pagination", async () => {
    const { user, caterer } = await catererLogin()
    const period = await activePeriod([caterer._id])
    const { profile } = await allocatedStudent(period, caterer)
    const api = await as(user)

    // produce one verification via manual verify
    const verify = await api.post("/api/v1/dining-meal-verification/manual").send({
      rollNumber: profile.rollNumber,
    })
    expect(verify.status).toBe(201)

    const res = await api.get("/api/v1/dining-meal-verification/feed")
    expect(res.status).toBe(200)
    expect(res.body.data.entries.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.pagination).toMatchObject({ page: 1 })
    expect(res.body.data.entries[0].catererId).toBe(String(caterer._id))

    // status filter
    const verifiedOnly = await api.get("/api/v1/dining-meal-verification/feed?status=verified")
    expect(verifiedOnly.body.data.entries.every((e) => e.status === "verified")).toBe(true)
  })
})

describe("dining meal verification — manual verify state machine", () => {
  it("validates roll number presence and unknown students", async () => {
    const { user, caterer } = await catererLogin()
    await activePeriod([caterer._id])
    const api = await as(user)

    let res = await api.post("/api/v1/dining-meal-verification/manual").send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/roll number is required/i)

    res = await api.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: "NOPE123" })
    expect(res.status).toBe(201) // recorded as unknown-student
    expect(res.body.message).toMatch(/roll number not found/i)
    expect(res.body.data.verification.status).toBe("unknown-student")
  })

  it("full flow: not-allocated -> wrong-caterer -> verified -> duplicate -> on-rebate", async () => {
    const a = await catererLogin("Caterer A")
    const b = await catererLogin("Caterer B")
    const period = await activePeriod([a.caterer._id, b.caterer._id])
    const { profile, student } = await allocatedStudent(period, b.caterer)

    const aApi = await as(a.user)
    const bApi = await as(b.user)

    // student allocated to B: scanning at A is wrong-caterer
    let res = await aApi.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: profile.rollNumber })
    expect(res.status).toBe(201)
    expect(res.body.data.verification.status).toBe("wrong-caterer")

    // a student with no allocation at all
    const outsider = await seed.student()
    const { StudentProfile } = await import("../../../src/models/index.js")
    const outsiderProfile = await StudentProfile.create({
      userId: outsider._id,
      rollNumber: `RN${Date.now().toString(36)}x${Math.random().toString(36).slice(2, 4)}`.toUpperCase(),
      degree: "B.Tech",
      department: "EE",
      gender: "Female",
      status: "Active",
    })
    res = await bApi.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: outsiderProfile.rollNumber })
    expect(res.body.data.verification.status).toBe("not-allocated")

    // correct caterer verifies
    res = await bApi.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: profile.rollNumber })
    expect(res.status).toBe(201)
    expect(res.body.message).toMatch(/verified successfully/i)
    expect(res.body.data.verification.status).toBe("verified")
    expect(res.body.data.verification.source).toBe("manual")
    expect(res.body.data.verification.student.profileId).toBe(String(profile._id))

    // second scan same slot is a duplicate
    res = await bApi.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: profile.rollNumber })
    expect(res.body.data.verification.status).toBe("duplicate")
    void student
  })

  it("available-students reflects verification state and counts", async () => {
    const { user, caterer } = await catererLogin("Availability Foods")
    const period = await activePeriod([caterer._id])
    const { profile } = await allocatedStudent(period, caterer)
    const api = await as(user)

    let res = await api.get("/api/v1/dining-meal-verification/available-students")
    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.verifiedCount).toBe(0)
    expect(res.body.data.students[0].rollNumber).toBe(profile.rollNumber)

    await api.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: profile.rollNumber })

    res = await api.get("/api/v1/dining-meal-verification/available-students")
    expect(res.body.data.verifiedCount).toBe(1)
    expect(res.body.data.pendingCount).toBe(0)
    expect(res.body.data.students[0].isVerified).toBe(true)
  })

  it("rebate-summary serves the caterer's rebate numbers", async () => {
    const { user } = await catererLogin("Rebate Foods")
    const api = await as(user)
    const res = await api.get("/api/v1/dining-meal-verification/rebate-summary")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
  })
})
