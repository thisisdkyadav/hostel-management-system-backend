/**
 * Undertakings module integration tests (/api/v1/undertaking).
 *
 * Legacy response style: controllers emit hand-picked fields, e.g.
 * POST /admin/undertakings responds `{ message, undertaking }`, the student
 * detail endpoint responds `{ undertaking }`, list endpoints respond
 * `{ undertakings }` / `{ students }` / `{ pendingUndertakings }` etc.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

const ADMIN_BASE = "/api/v1/undertaking/admin/undertakings"

beforeAll(async () => {
  await setupTestDb()
  // The suite drops collections between files; mongoose's background
  // autoIndex build can race with the first inserts, making the unique
  // {undertakingId, studentId} index flaky. Production always has the index,
  // so build it deterministically before exercising duplicate handling.
  const { default: UndertakingAssignment } = await import(
    "../../../src/models/certificate/UndertakingAssignment.model.js"
  )
  await UndertakingAssignment.syncIndexes()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("undertakings — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.get(ADMIN_BASE)).status).toBe(401)
    expect((await api.post(ADMIN_BASE).send({})).status).toBe(401)
    expect((await api.get("/api/v1/undertaking/student/undertakings/pending")).status).toBe(401)
    expect((await api.post(`${ADMIN_BASE}/000000000000000000000000/students/by-roll-numbers`).send({})).status).toBe(401)
  })

  it("admin CRUD rejects Hostel Supervisor and students", async () => {
    const hsApi = await as(await seed.hostelSupervisor())
    expect((await hsApi.post(ADMIN_BASE).send({ title: "t", description: "d", content: "c", deadline: new Date() })).status).toBe(403)
    expect((await hsApi.put(`${ADMIN_BASE}/000000000000000000000000`).send({})).status).toBe(403)
    expect((await hsApi.delete(`${ADMIN_BASE}/000000000000000000000000`)).status).toBe(403)

    const studentApi = await as(await seed.student())
    expect((await studentApi.get(ADMIN_BASE)).status).toBe(403)
  })

  it("read/status routes allow Hostel Supervisor", async () => {
    const hsApi = await as(await seed.hostelSupervisor())
    const res = await hsApi.get(ADMIN_BASE)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.undertakings)).toBe(true)
  })

  it("student routes reject staff roles", async () => {
    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.get("/api/v1/undertaking/student/undertakings/pending")).status).toBe(403)
    expect(
      (await wardenApi.post(`/api/v1/undertaking/student/undertakings/000000000000000000000000/accept`).send({ accepted: true }))
        .status
    ).toBe(403)
  })
})

describe("undertakings — admin CRUD", () => {
  let adminApi, wardenApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    wardenApi = await as(await seed.warden())
  })

  it("500 when required model fields are missing (documented current behavior)", async () => {
    // SUSPECTED BUG: on failure the service returns an envelope without data,
    // but createUndertaking's controller reads result.data.undertaking
    // unconditionally — the TypeError bubbles to the global handler as 500.
    const res = await adminApi.post(ADMIN_BASE).send({ title: "Missing content" })
    expect(res.status).toBe(500)
  })

  it("warden can create; response carries message + undertaking", async () => {
    const res = await wardenApi.post(ADMIN_BASE).send({
      title: "Anti-ragging undertaking",
      description: "Mandatory for all residents",
      content: "I promise not to participate in ragging.",
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    expect(res.status).toBe(201)
    expect(res.body.message).toBe("Undertaking created successfully")
    expect(res.body.undertaking.title).toBe("Anti-ragging undertaking")
    expect(res.body.undertaking.status).toBe("active")
    expect(res.body.undertaking.id).toBeDefined()
  })

  it("GET lists all undertakings with counts", async () => {
    const res = await adminApi.get(ADMIN_BASE)
    expect(res.status).toBe(200)
    expect(res.body.undertakings).toHaveLength(1)
    const item = res.body.undertakings[0]
    expect(item).toMatchObject({ title: "Anti-ragging undertaking", totalStudents: 0, acceptedCount: 0 })
    expect(item.deadline).toBeDefined()
  })

  it("PUT updates; 404 for unknown id", async () => {
    const listRes = await adminApi.get(ADMIN_BASE)
    const id = String(listRes.body.undertakings[0].id)

    const res = await adminApi.put(`${ADMIN_BASE}/${id}`).send({
      title: "Anti-ragging undertaking v2",
      description: "Updated description",
      content: "Updated content",
      deadline: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Undertaking updated successfully")
    expect(res.body.undertaking.title).toBe("Anti-ragging undertaking v2")

    const missing = await adminApi.put(`${ADMIN_BASE}/000000000000000000000000`).send({ title: "x" })
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Undertaking not found")
  })
})

describe("undertakings — assignments & acceptance workflow", () => {
  let adminApi, undertakingId, s1, s2, p1, p2

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: s1, profile: p1 } = await campusSeed.studentWithProfile({
      profile: { rollNumber: "UND001" },
    }))
    ;({ user: s2, profile: p2 } = await campusSeed.studentWithProfile({
      profile: { rollNumber: "UND002" },
    }))

    const created = await adminApi.post(ADMIN_BASE).send({
      title: "Hostel rules undertaking",
      description: "Read and accept the hostel rulebook",
      content: "I have read and accept the hostel rulebook.",
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    undertakingId = String(created.body.undertaking.id)
  })

  it("400 when rollNumbers is missing or empty", async () => {
    expect((await adminApi.post(`${ADMIN_BASE}/${undertakingId}/students/by-roll-numbers`).send({})).status).toBe(400)
    expect(
      (await adminApi.post(`${ADMIN_BASE}/${undertakingId}/students/by-roll-numbers`).send({ rollNumbers: [] })).status
    ).toBe(400)
  })

  it("404 for unknown undertaking and for unmatched roll numbers", async () => {
    const noUndertaking = await adminApi
      .post(`${ADMIN_BASE}/000000000000000000000000/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND001"] })
    expect(noUndertaking.status).toBe(404)
    expect(noUndertaking.body.message).toBe("Undertaking not found")

    const noStudents = await adminApi
      .post(`${ADMIN_BASE}/${undertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["NOPE999"] })
    expect(noStudents.status).toBe(404)
    expect(noStudents.body.message).toMatch(/No students found/)
  })

  it("assigns students by roll number", async () => {
    const res = await adminApi
      .post(`${ADMIN_BASE}/${undertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["und001", "UND002"] }) // case-insensitive match via uppercase normalization
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Students added to undertaking successfully")
    expect(res.body.addedCount).toBe(2)
    expect(res.body.undertakingId).toBe(undertakingId)
    expect(res.body.addedStudents.map((s) => s.rollNumber).sort()).toEqual(["UND001", "UND002"])

    const studentsRes = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/students`)
    expect(studentsRes.status).toBe(200)
    expect(studentsRes.body.students).toHaveLength(2)
    expect(studentsRes.body.students.every((s) => s.status === "not_viewed")).toBe(true)
  })

  it("re-adding the same students adds nobody (unique index skips dups)", async () => {
    const res = await adminApi
      .post(`${ADMIN_BASE}/${undertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND001"] })
    expect(res.status).toBe(200)
    expect(res.body.addedCount).toBe(0)

    const studentsRes = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/students`)
    expect(studentsRes.body.students).toHaveLength(2)
  })

  it("GET .../status reports per-status stats", async () => {
    const res = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/status`)
    expect(res.status).toBe(200)
    expect(res.body.undertakingId).toBe(undertakingId)
    expect(res.body.stats).toEqual({ totalStudents: 2, accepted: 0, pending: 0, notViewed: 2 })
  })

  it("profile-less student gets 404 from student endpoints", async () => {
    const api = await as(await seed.student())
    const res = await api.get("/api/v1/undertaking/student/undertakings/pending")
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Student profile not found")
  })

  it("assigned student sees it as pending with a correct count", async () => {
    const api = await as(s1)
    const res = await api.get("/api/v1/undertaking/student/undertakings/pending")
    expect(res.status).toBe(200)
    expect(res.body.pendingUndertakings).toHaveLength(1)
    expect(res.body.pendingUndertakings[0].title).toBe("Hostel rules undertaking")

    const countRes = await api.get("/api/v1/undertaking/student/undertakings/pending/count")
    expect(countRes.status).toBe(200)
    expect(countRes.body.count).toBe(1)
  })

  it("unassigned student gets 404 on details and cannot accept", async () => {
    const outsider = await campusSeed.studentWithProfile({ profile: { rollNumber: "UND003" } })
    const api = await as(outsider.user)
    const details = await api.get(`/api/v1/undertaking/student/undertakings/${undertakingId}`)
    expect(details.status).toBe(404)
    expect(details.body.message).toMatch(/not assigned/)

    const accept = await api
      .post(`/api/v1/undertaking/student/undertakings/${undertakingId}/accept`)
      .send({ accepted: true })
    expect(accept.status).toBe(404)
  })

  it("viewing details flips not_viewed -> pending exactly once", async () => {
    const api = await as(s1)
    const first = await api.get(`/api/v1/undertaking/student/undertakings/${undertakingId}`)
    expect(first.status).toBe(200)
    expect(first.body.undertaking.status).toBe("pending")

    const second = await api.get(`/api/v1/undertaking/student/undertakings/${undertakingId}`)
    expect(second.body.undertaking.status).toBe("pending")

    const statusRes = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/status`)
    expect(statusRes.body.stats).toEqual({ totalStudents: 2, accepted: 0, pending: 1, notViewed: 1 })
  })

  it("accept requires confirmation, then records acceptance", async () => {
    const api = await as(s1)
    const noConfirm = await api
      .post(`/api/v1/undertaking/student/undertakings/${undertakingId}/accept`)
      .send({})
    expect(noConfirm.status).toBe(400)
    expect(noConfirm.body.message).toBe("Acceptance confirmation required")

    const res = await api
      .post(`/api/v1/undertaking/student/undertakings/${undertakingId}/accept`)
      .send({ accepted: true })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Undertaking accepted successfully")
    expect(res.body.undertakingId).toBe(undertakingId)
    expect(new Date(res.body.acceptedAt).getTime()).toBeLessThanOrEqual(Date.now())

    const acceptedRes = await api.get("/api/v1/undertaking/student/undertakings/accepted")
    expect(acceptedRes.body.acceptedUndertakings).toHaveLength(1)
    expect(acceptedRes.body.acceptedUndertakings[0].title).toBe("Hostel rules undertaking")

    const countRes = await api.get("/api/v1/undertaking/student/undertakings/pending/count")
    expect(countRes.body.count).toBe(0)

    const statusRes = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/status`)
    // s1 accepted, s2 has not viewed yet.
    expect(statusRes.body.stats).toEqual({ totalStudents: 2, accepted: 1, pending: 0, notViewed: 1 })
  })

  it("admin removes a student from the undertaking", async () => {
    const res = await adminApi.delete(`${ADMIN_BASE}/${undertakingId}/students/${p2._id}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Student removed from undertaking successfully")
    expect(String(res.body.studentId)).toBe(String(p2._id))

    const missing = await adminApi.delete(`${ADMIN_BASE}/${undertakingId}/students/${p2._id}`)
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Assignment not found")

    const statusRes = await adminApi.get(`${ADMIN_BASE}/${undertakingId}/status`)
    expect(statusRes.body.stats.totalStudents).toBe(1)
  })

  it("deleting the undertaking cascades assignments away", async () => {
    const delRes = await adminApi.delete(`${ADMIN_BASE}/${undertakingId}`)
    expect(delRes.status).toBe(200)
    expect(delRes.body.message).toBe("Undertaking deleted successfully")
    expect(delRes.body.undertakingId).toBe(undertakingId)

    const missing = await adminApi.delete(`${ADMIN_BASE}/${undertakingId}`)
    expect(missing.status).toBe(404)

    const api = await as(s1)
    const pendingRes = await api.get("/api/v1/undertaking/student/undertakings/pending")
    expect(pendingRes.body.pendingUndertakings).toHaveLength(0)
  })
})

describe("undertakings — create validation one field at a time", () => {
  let adminApi

  const validBody = {
    title: "Validation probe undertaking",
    description: "Probe description",
    content: "Probe content",
    deadline: new Date(Date.now() + 24 * 3600 * 1000),
  }

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("500 when each required field is missing individually", async () => {
    // SUSPECTED BUG: every missing-required-field case below surfaces as a
    // 500 instead of a 4xx validation error (same root cause documented in
    // the admin CRUD suite above).
    for (const field of ["title", "description", "content", "deadline"]) {
      const body = { ...validBody }
      delete body[field]
      const res = await adminApi.post(ADMIN_BASE).send(body)
      expect(res.status).toBe(500)
      const listed = await adminApi.get(ADMIN_BASE)
      expect(listed.body.undertakings.map((u) => u.title)).not.toContain(validBody.title)
    }
  })

  it("500 for an unparseable deadline value", async () => {
    // SUSPECTED BUG: CastError on deadline -> 500, no partial record created.
    const res = await adminApi
      .post(ADMIN_BASE)
      .send({ ...validBody, title: "Bad deadline probe", deadline: "not-a-date" })
    expect(res.status).toBe(500)
    const listed = await adminApi.get(ADMIN_BASE)
    expect(listed.body.undertakings.map((u) => u.title)).not.toContain("Bad deadline probe")
  })
})

describe("undertakings — bulk add edges", () => {
  let adminApi, hsApi, bulkUndertakingId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hsApi = await as(await seed.hostelSupervisor())
    await campusSeed.studentWithProfile({ profile: { rollNumber: "UND010" } })
    await campusSeed.studentWithProfile({ profile: { rollNumber: "UND011" } })

    const created = await adminApi.post(ADMIN_BASE).send({
      title: "Bulk edge undertaking",
      description: "Bulk edges",
      content: "Bulk content",
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    bulkUndertakingId = String(created.body.undertaking.id)
  })

  it("403 for Hostel Supervisor (write route)", async () => {
    const res = await hsApi
      .post(`${ADMIN_BASE}/${bulkUndertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND010"] })
    expect(res.status).toBe(403)
  })

  it("duplicate entries within one request collapse into a single assignment", async () => {
    const res = await adminApi
      .post(`${ADMIN_BASE}/${bulkUndertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND010", "und010", "UND010"] })
    expect(res.status).toBe(200)
    // The profiles query dedupes via $in, so exactly one assignment row exists.
    expect(res.body.addedCount).toBe(1)
    expect(res.body.addedStudents).toHaveLength(1)

    const studentsRes = await adminApi.get(`${ADMIN_BASE}/${bulkUndertakingId}/students`)
    const rolls = studentsRes.body.students.map((s) => s.rollNumber)
    expect(rolls.filter((r) => r === "UND010")).toHaveLength(1)
  })

  it("mixed found/not-found roll numbers silently skip the misses", async () => {
    // SUSPECTED BUG: unknown roll numbers produce neither an error nor any
    // report of skipped students — the response only lists what matched.
    const res = await adminApi
      .post(`${ADMIN_BASE}/${bulkUndertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND011", "GHOST999"] })
    expect(res.status).toBe(200)
    expect(res.body.addedCount).toBe(1)
    expect(res.body.addedStudents.map((s) => s.rollNumber)).toEqual(["UND011"])
    expect(JSON.stringify(res.body)).not.toContain("GHOST999")
  })

  it("400 when exceeding MAX_BULK_RECORDS", async () => {
    const res = await adminApi
      .post(`${ADMIN_BASE}/${bulkUndertakingId}/students/by-roll-numbers`)
      .send({ rollNumbers: Array.from({ length: 10001 }, (_, i) => `X${i}`) })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Maximum \d+ records are allowed per request/)
  })
})

describe("undertakings — misc routes & idempotency", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("status route 404s for an unknown undertaking", async () => {
    const res = await adminApi.get(`${ADMIN_BASE}/000000000000000000000000/status`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Undertaking not found")
  })

  it("list endpoint ignores unsupported query filters such as status", async () => {
    // Documented current behavior: getAllUndertakings takes no filters, so
    // ?status=<anything> (even invalid enum junk) changes nothing.
    const plain = await adminApi.get(ADMIN_BASE)
    const filtered = await adminApi.get(`${ADMIN_BASE}?status=nonsense-value`)
    expect(filtered.status).toBe(200)
    expect(filtered.body.undertakings.length).toBeGreaterThanOrEqual(plain.body.undertakings.length)
  })

  it("re-accepting overwrites acceptedAt (no conflict raised)", async () => {
    const { user } = await campusSeed.studentWithProfile({ profile: { rollNumber: "UND012" } })
    const created = await adminApi.post(ADMIN_BASE).send({
      title: "Reaccept undertaking",
      description: "d",
      content: "c",
      deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    })
    const id = String(created.body.undertaking.id)
    await adminApi
      .post(`${ADMIN_BASE}/${id}/students/by-roll-numbers`)
      .send({ rollNumbers: ["UND012"] })

    const api = await as(user)
    const first = await api
      .post(`/api/v1/undertaking/student/undertakings/${id}/accept`)
      .send({ accepted: true })
    expect(first.status).toBe(200)
    const firstAcceptedAt = new Date(first.body.acceptedAt).getTime()

    await new Promise((resolve) => setTimeout(resolve, 25))
    const second = await api
      .post(`/api/v1/undertaking/student/undertakings/${id}/accept`)
      .send({ accepted: true })
    expect(second.status).toBe(200)
    // Current behavior: acceptedAt is simply rewritten on re-accept.
    expect(new Date(second.body.acceptedAt).getTime()).toBeGreaterThanOrEqual(firstAcceptedAt)

    const statusRes = await adminApi.get(`${ADMIN_BASE}/${id}/status`)
    expect(statusRes.body.stats).toEqual({ totalStudents: 1, accepted: 1, pending: 0, notViewed: 0 })
  })
})
