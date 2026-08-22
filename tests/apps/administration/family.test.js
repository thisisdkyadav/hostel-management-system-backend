import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/operations.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// Family members hang off a student's userId. Responses are NOT envelope
// wrapped — the controller sends the service payload directly:
//   POST /:userId  -> 201 { familyMember }
//   GET  /:userId  -> [ ...members ]        (bare array)
//   PUT  /:id      -> { familyMember }
//   DELETE /:id    -> {}
//   POST /bulk-update -> { success, data: { totalUpdated, notFound, ... } }
const BASE = "/api/v1/family"
let counter = 0
const nextRoll = () => `FM${Date.now().toString(36).toUpperCase()}${counter++}`

/** A student User + StudentProfile pair (profile rollNumber is uppercase). */
async function seedStudent() {
  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id })
  return { user, profile }
}

describe("POST /family/:userId (create)", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/000000000000000000000000`).send({
      name: "X", relationship: "Mother", phone: "9999999999",
    })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.post(`${BASE}/000000000000000000000000`).send({
      name: "X", relationship: "Mother", phone: "9999999999",
    })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("400 for a malformed userId (CastError)", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.post(`${BASE}/not-an-objectid`).send({
      name: "X", relationship: "Mother", phone: "9999999999",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid id format/i)
  })

  it("404 when the user does not exist", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.post(`${BASE}/000000000000000000000000`).send({
      name: "Ghost Parent", relationship: "Father", phone: "9999999999",
    })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/user not found/i)
  })

  it("422 when required fields (name / relationship / phone) are missing", async () => {
    const { user } = await seedStudent()
    const admin = await seed.admin()
    const api = await as(admin)

    const res = await api.post(`${BASE}/${user._id}`).send({})
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)

    const fields = res.body.errors.map((e) => e.field)
    for (const field of ["name", "relationship", "phone"]) {
      expect(fields).toContain(field)
    }
  })

  it("creates a member and persists via follow-up GET", async () => {
    const { user } = await seedStudent()
    const admin = await seed.admin()
    const api = await as(admin)

    const res = await api.post(`${BASE}/${user._id}`).send({
      name: "Priya Sharma",
      relationship: "Mother",
      phone: "9876543210",
      email: "priya@example.com",
      address: "12 MG Road, Indore",
    })
    expect(res.status).toBe(201)
    expect(res.body.familyMember).toMatchObject({
      name: "Priya Sharma",
      relationship: "Mother",
      phone: "9876543210",
      email: "priya@example.com",
      userId: String(user._id),
    })

    const get = await api.get(`${BASE}/${user._id}`)
    expect(get.status).toBe(200)
    expect(get.body).toHaveLength(1)
    expect(get.body[0].name).toBe("Priya Sharma")
  })
})

describe("family CRUD lifecycle", () => {
  let adminApi
  let student // { user, profile }
  let motherId

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
    student = await seedStudent()

    const mother = await adminApi.post(`${BASE}/${student.user._id}`).send({
      name: "Sunita Verma", relationship: "Mother", phone: "1111111111",
    })
    motherId = mother.body.familyMember.id ?? mother.body.familyMember._id
    await adminApi.post(`${BASE}/${student.user._id}`).send({
      name: "Rajesh Verma", relationship: "Father", phone: "2222222222",
    })
  })

  it("GET lists every member linked to the student", async () => {
    const res = await adminApi.get(`${BASE}/${student.user._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    const names = res.body.map((m) => m.name).sort()
    expect(names).toEqual(["Rajesh Verma", "Sunita Verma"])
    for (const member of res.body) {
      expect(member.userId).toBe(String(student.user._id))
    }
  })

  it("PUT updates a member and the change shows up in GET", async () => {
    const res = await adminApi.put(`${BASE}/${motherId}`).send({ phone: "3333333333" })
    expect(res.status).toBe(200)
    expect(res.body.familyMember.phone).toBe("3333333333")

    const get = await adminApi.get(`${BASE}/${student.user._id}`)
    const mother = get.body.find((m) => m.name === "Sunita Verma")
    expect(mother.phone).toBe("3333333333")
  })

  it("PUT returns 404 for an unknown family-member id", async () => {
    const res = await adminApi.put(`${BASE}/000000000000000000000000`).send({ phone: "1" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/family member not found/i)
  })

  it("DELETE removes one member only; repeat delete returns 404", async () => {
    const del = await adminApi.delete(`${BASE}/${motherId}`)
    expect(del.status).toBe(200)

    const get = await adminApi.get(`${BASE}/${student.user._id}`)
    expect(get.status).toBe(200)
    expect(get.body).toHaveLength(1)
    expect(get.body[0].name).toBe("Rajesh Verma") // father untouched

    const again = await adminApi.delete(`${BASE}/${motherId}`)
    expect(again.status).toBe(404)
    expect(again.body.message).toMatch(/family member not found/i)
  })

  it("GET returns [] for a student with no members", async () => {
    const fresh = await seedStudent()
    const res = await adminApi.get(`${BASE}/${fresh.user._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("wardens may manage family members too", async () => {
    const warden = await seed.warden()
    const api = await as(warden)

    const created = await api.post(`${BASE}/${student.user._id}`).send({
      name: "Kiran Verma", relationship: "Sibling", phone: "4444444444",
    })
    expect(created.status).toBe(201)

    const get = await api.get(`${BASE}/${student.user._id}`)
    expect(get.body.some((m) => m.relationship === "Sibling")).toBe(true)

    // clean up so later suites see a deterministic state
    const siblingId = created.body.familyMember.id ?? created.body.familyMember._id
    await adminApi.delete(`${BASE}/${siblingId}`)
  })
})

describe("POST /family/bulk-update", () => {
  let adminApi
  let studentA // two existing members
  let studentB // untouched by first run
  let rollBogus

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
    studentA = await seedStudent()
    studentB = await seedStudent()

    const first = await adminApi.post(`${BASE}/bulk-update`).send({
      familyData: {
        members: [
          { rollNumber: studentA.profile.rollNumber.toLowerCase(), name: "A Mother", relationship: "Mother", phone: "5550001" },
          { rollNumber: studentA.profile.rollNumber, name: "A Father", relationship: "Father", phone: "5550002" },
        ],
      },
    })
    expect(first.status).toBe(200)
  })

  it("reports per-roll results and skips unknown roll numbers", async () => {
    rollBogus = nextRoll()
    const res = await adminApi.post(`${BASE}/bulk-update`).send({
      familyData: {
        members: [
          { rollNumber: studentB.profile.rollNumber.toLowerCase(), name: "B Guardian", relationship: "Guardian", phone: "6660001" },
          { rollNumber: rollBogus.toLowerCase(), name: "Nobody", relationship: "Uncle", phone: "6660002" },
        ],
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.totalUpdated).toBe(1)
    expect(res.body.data.totalProcessed).toBe(2)
    expect(res.body.data.notFoundCount).toBe(1)
    expect(res.body.data.notFound).toEqual([rollBogus.toUpperCase()])
    expect(res.body.data.failedCount).toBe(0)
  })

  it("persisted exactly the in-scope members via follow-up GETs", async () => {
    const getA = await adminApi.get(`${BASE}/${studentA.user._id}`)
    expect(getA.body.map((m) => m.name).sort()).toEqual(["A Father", "A Mother"])

    const getB = await adminApi.get(`${BASE}/${studentB.user._id}`)
    expect(getB.body).toHaveLength(1)
    expect(getB.body[0]).toMatchObject({ name: "B Guardian", phone: "6660001" })
  })

  it("deleteExisting replaces all prior members of touched students", async () => {
    const res = await adminApi.post(`${BASE}/bulk-update`).send({
      familyData: {
        deleteExisting: true,
        members: [
          { rollNumber: studentA.profile.rollNumber, name: "A Only Contact", relationship: "Mother", phone: "7770001" },
        ],
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.totalUpdated).toBe(1)

    const getA = await adminApi.get(`${BASE}/${studentA.user._id}`)
    expect(getA.body).toHaveLength(1)
    expect(getA.body[0].name).toBe("A Only Contact")
  })

  it("400 when familyData.members is missing or empty", async () => {
    const missing = await adminApi.post(`${BASE}/bulk-update`).send({})
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/valid family members data is required/i)

    const empty = await adminApi.post(`${BASE}/bulk-update`).send({ familyData: { members: [] } })
    expect(empty.status).toBe(400)
  })

  it("404 when no roll number matches any student", async () => {
    const res = await adminApi.post(`${BASE}/bulk-update`).send({
      familyData: { members: [{ rollNumber: nextRoll(), name: "X", relationship: "Father", phone: "1" }] },
    })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no students found/i)
  })

  it("fail-closed: a hostel-bound warden without an active hostel reaches no students", async () => {
    const warden = await seed.warden() // no hostel on the fabricated session
    const api = await as(warden)
    const res = await api.post(`${BASE}/bulk-update`).send({
      familyData: {
        members: [
          { rollNumber: studentA.profile.rollNumber, name: "Scoped Out", relationship: "Father", phone: "1" },
        ],
      },
    })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no students found/i)

    // nothing was written
    const getA = await adminApi.get(`${BASE}/${studentA.user._id}`)
    expect(getA.body).toHaveLength(1) // still "A Only Contact"
  })
})
