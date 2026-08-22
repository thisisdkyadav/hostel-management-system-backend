/**
 * Feedback module integration tests (/api/v1/feedback).
 *
 * Legacy response style: controllers emit `result.data` directly; the
 * success() message-hoist means create/update/reply respond
 * `{ feedback, success: true }` and delete responds `{ success: true }`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("feedback — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.post("/api/v1/feedback/add").send({})).status).toBe(401)
    expect((await api.get("/api/v1/feedback")).status).toBe(401)
    expect((await api.put("/api/v1/feedback/000000000000000000000000").send({})).status).toBe(401)
    expect((await api.delete("/api/v1/feedback/000000000000000000000000")).status).toBe(401)
    expect(
      (await api.put("/api/v1/feedback/update-status/000000000000000000000000").send({})).status
    ).toBe(401)
    expect((await api.post("/api/v1/feedback/reply/000000000000000000000000").send({})).status).toBe(401)
  })

  it("POST /add and student CRUD are Student-only", async () => {
    const wardenApi = await as(await seed.warden())
    const res = await wardenApi.post("/api/v1/feedback/add").send({ title: "t", description: "d" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Access denied/)

    // Staff cannot use the student self-service update/delete routes either.
    expect(
      (await wardenApi.put("/api/v1/feedback/000000000000000000000000").send({ title: "x" })).status
    ).toBe(403)
    expect((await wardenApi.delete("/api/v1/feedback/000000000000000000000000")).status).toBe(403)
  })

  it("staff management routes reject students", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/feedback/student/000000000000000000000000")).status).toBe(403)
    expect(
      (await studentApi.put("/api/v1/feedback/update-status/000000000000000000000000").send({ status: "Seen" }))
        .status
    ).toBe(403)
    expect(
      (await studentApi.post("/api/v1/feedback/reply/000000000000000000000000").send({ reply: "x" })).status
    ).toBe(403)
  })
})

describe("feedback — POST /add", () => {
  let hostel

  beforeAll(async () => {
    await as(await seed.admin())
    hostel = await campusSeed.createHostel({ name: "Feedback Hostel" })
  })

  it("400 when the student has no active room allocation", async () => {
    const { user } = await campusSeed.studentWithProfile() // no hostel
    const api = await as(user)
    const res = await api.post("/api/v1/feedback/add").send({ title: "No alloc", description: "d" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/doesn't have an active hostel allocation/)
  })

  it("201 happy path — attaches the student's allocated hostel and starts Pending", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { hostel },
      user: { name: "Feedback Author" },
    })
    const api = await as(user)
    const res = await api
      .post("/api/v1/feedback/add")
      .send({ title: "Mess food quality", description: "Dinner is often cold." })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.feedback.title).toBe("Mess food quality")
    expect(res.body.feedback.status).toBe("Pending")
    expect(res.body.feedback.reply).toBeNull()
    expect(String(res.body.feedback.hostelId)).toBe(String(hostel._id))
    expect(String(res.body.feedback.userId)).toBe(String(user._id))
  })
})

describe("feedback — GET / and GET /student/:userId", () => {
  let adminApi, hostel, authorUser, otherUser, feedbackId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hostel = await campusSeed.createHostel({ name: "Feedback List Hostel" })
    ;({ user: authorUser } = await campusSeed.studentWithProfile({
      profile: { hostel, rollNumber: "FBLIST01" },
    }))
    ;({ user: otherUser } = await campusSeed.studentWithProfile({
      profile: { hostel, rollNumber: "FBLIST02" },
    }))

    const api = await as(authorUser)
    const created = await api
      .post("/api/v1/feedback/add")
      .send({ title: "Water cooler broken", description: "Second floor dispenser leaks" })
    feedbackId = String(created.body.feedback._id)
    await as(otherUser) // ensure second student session works
    const otherApi = await as(otherUser)
    await otherApi
      .post("/api/v1/feedback/add")
      .send({ title: "Gym timings", description: "Extend morning hours please" })
  })

  it("students see only their own feedbacks", async () => {
    const api = await as(authorUser)
    const res = await api.get("/api/v1/feedback")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.feedbacks).toHaveLength(1)
    // userId is populated by the list query.
    expect(String(res.body.feedbacks[0].userId._id)).toBe(String(authorUser._id))
    expect(res.body.stats).toMatchObject({ total: 1, pending: 1, seen: 0 })
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 1 })
  })

  it("unscoped staff sees all feedbacks with stats", async () => {
    const res = await adminApi.get("/api/v1/feedback")
    expect(res.status).toBe(200)
    expect(res.body.feedbacks).toHaveLength(3) // 2 here + one from the create suite
    expect(res.body.stats.total).toBe(3)
    expect(res.body.stats.pending).toBe(3)
    expect(new Date(res.body.stats.latestFeedbackDate).getTime()).toBeGreaterThan(0)
  })

  it("status filter narrows results", async () => {
    const res = await adminApi.get("/api/v1/feedback?status=seen")
    expect(res.body.feedbacks).toHaveLength(0)
    const pendingRes = await adminApi.get("/api/v1/feedback?status=pending")
    expect(pendingRes.body.feedbacks).toHaveLength(3)
  })

  it("search matches title or description", async () => {
    const res = await adminApi.get("/api/v1/feedback?search=water%20cooler")
    expect(res.body.feedbacks.map((f) => f.title)).toEqual(["Water cooler broken"])
    const descRes = await adminApi.get("/api/v1/feedback?search=morning%20hours")
    expect(descRes.body.feedbacks.map((f) => f.title)).toEqual(["Gym timings"])
  })

  it("GET /student/:userId returns a specific student's feedbacks (staff)", async () => {
    const res = await adminApi.get(`/api/v1/feedback/student/${authorUser._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.feedbacks).toHaveLength(1)
    expect(res.body.feedbacks[0].title).toBe("Water cooler broken")
  })

  it("GET /student/:userId returns an empty list for unknown users", async () => {
    const res = await adminApi.get("/api/v1/feedback/student/000000000000000000000000")
    expect(res.status).toBe(200)
    expect(res.body.feedbacks).toEqual([])
  })
})

describe("feedback — student update/delete + staff status/reply workflow", () => {
  let adminApi, wardenApi, hostel, studentUser, studentApi, feedbackId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    wardenApi = await as(await seed.warden())
    hostel = await campusSeed.createHostel({ name: "Feedback Flow Hostel" })
    ;({ user: studentUser } = await campusSeed.studentWithProfile({ profile: { hostel } }))
    studentApi = await as(studentUser)
    const created = await studentApi
      .post("/api/v1/feedback/add")
      .send({ title: "Original title", description: "Original description" })
    feedbackId = String(created.body.feedback._id)
  })

  it("student edits own feedback", async () => {
    const res = await studentApi
      .put(`/api/v1/feedback/${feedbackId}`)
      .send({ title: "Edited title", description: "Edited description" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.feedback.title).toBe("Edited title")

    const listRes = await studentApi.get("/api/v1/feedback")
    expect(listRes.body.feedbacks[0].description).toBe("Edited description")
  })

  it("404 when editing/deleting an unknown feedback", async () => {
    expect(
      (await studentApi.put("/api/v1/feedback/000000000000000000000000").send({ title: "x" })).status
    ).toBe(404)
    expect((await studentApi.delete("/api/v1/feedback/000000000000000000000000")).status).toBe(404)
  })

  it("staff marks status Seen (clears any reply), then replies", async () => {
    const statusRes = await wardenApi
      .put(`/api/v1/feedback/update-status/${feedbackId}`)
      .send({ status: "Seen" })
    expect(statusRes.status).toBe(200)
    expect(statusRes.body.feedback.status).toBe("Seen")
    expect(statusRes.body.feedback.reply).toBeNull()

    const replyRes = await adminApi
      .post(`/api/v1/feedback/reply/${feedbackId}`)
      .send({ reply: "Fixed by maintenance, thanks!" })
    expect(replyRes.status).toBe(200)
    expect(replyRes.body.feedback.reply).toBe("Fixed by maintenance, thanks!")
    expect(replyRes.body.feedback.status).toBe("Seen")

    // Status update resets the reply to null (documented behavior).
    const resetRes = await wardenApi
      .put(`/api/v1/feedback/update-status/${feedbackId}`)
      .send({ status: "Pending" })
    expect(resetRes.body.feedback.status).toBe("Pending")
    expect(resetRes.body.feedback.reply).toBeNull()

    const statsRes = await adminApi.get("/api/v1/feedback?status=pending")
    expect(statsRes.body.feedbacks.map((f) => f.title)).toContain("Edited title")
  })

  it("invalid status value surfaces as the service's generic 500 (documented)", async () => {
    // SUSPECTED BUG: enum-violating status is caught by the service try/catch
    // and returned as 500 "Failed to update Feedback" instead of a 4xx.
    const res = await wardenApi
      .put(`/api/v1/feedback/update-status/${feedbackId}`)
      .send({ status: "Bogus" })
    expect(res.status).toBe(500)
  })

  it("student deletes own feedback; it disappears from listings", async () => {
    const res = await studentApi.delete(`/api/v1/feedback/${feedbackId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const listRes = await studentApi.get("/api/v1/feedback")
    expect(listRes.body.feedbacks).toHaveLength(0)
  })
})

describe("feedback — hardening edge cases", () => {
  let adminApi, wardenApi, hostel

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    wardenApi = await as(await seed.warden())
    hostel = await campusSeed.createHostel({ name: "Feedback Hardening Hostel" })
  })

  async function authorWithAllocation() {
    const { user } = await campusSeed.studentWithProfile({
      profile: { hostel, rollNumber: `FBH${Math.random().toString(36).slice(2, 8).toUpperCase()}` },
    })
    return { user, api: await as(user) }
  }

  it("the same student may submit multiple feedbacks (no uniqueness conflict)", async () => {
    // Documented behavior: there is no one-feedback-per-student constraint;
    // identical payloads both succeed.
    const { user, api } = await authorWithAllocation()
    const payload = { title: "Duplicate topic", description: "Same text twice" }
    const first = await api.post("/api/v1/feedback/add").send(payload)
    const second = await api.post("/api/v1/feedback/add").send(payload)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(String(first.body.feedback._id)).not.toBe(String(second.body.feedback._id))

    const listRes = await as(user).then((a) => a.get("/api/v1/feedback"))
    expect(listRes.body.feedbacks.filter((f) => f.title === "Duplicate topic")).toHaveLength(2)
  })

  it("missing title alone surfaces as the generic 500 (documented)", async () => {
    // SUSPECTED BUG: required-field ValidationError is swallowed by the
    // service's blanket catch -> 500 instead of a 4xx validation error.
    const { api } = await authorWithAllocation()
    const res = await api.post("/api/v1/feedback/add").send({ description: "no title" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to create Feedback")
  })

  it("missing description alone surfaces as the generic 500 (documented)", async () => {
    const { api } = await authorWithAllocation()
    const res = await api.post("/api/v1/feedback/add").send({ title: "no description" })
    expect(res.status).toBe(500)
  })

  it("very long descriptions are accepted — no length limit exists (documented)", async () => {
    const { api } = await authorWithAllocation()
    const res = await api
      .post("/api/v1/feedback/add")
      .send({ title: "Long rant", description: "x".repeat(2000) })
    expect(res.status).toBe(201)
    expect(res.body.feedback.description).toHaveLength(2000)
  })

  it("malformed ids on id-bearing routes surface as 500, not 400 (documented)", async () => {
    // SUSPECTED BUG: unlike certificates/events/lost-and-found (which map
    // CastError to 400 "Invalid ID format" via rethrowKnownMongooseErrors),
    // every feedback service catch converts CastError into a generic
    // 500 "Failed to ..." response.
    let res = await wardenApi.put("/api/v1/feedback/update-status/garbage").send({ status: "Seen" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to update Feedback")

    res = await wardenApi.post("/api/v1/feedback/reply/garbage").send({ reply: "x" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to update Feedback")

    res = await wardenApi.get("/api/v1/feedback/student/garbage")
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to fetch Feedbacks")

    const studentApi = await as(await seed.student())
    res = await studentApi.put("/api/v1/feedback/garbage").send({ title: "x" })
    expect(res.status).toBe(500)

    res = await studentApi.delete("/api/v1/feedback/garbage")
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to delete Feedback")
  })

  it("PUT update-status with an empty body is a silent no-op 200 (documented)", async () => {
    // SUSPECTED BUG: status is undefined and stripped by mongoose, so the call
    // succeeds without changing anything instead of rejecting.
    const { api } = await authorWithAllocation()
    const created = await api.post("/api/v1/feedback/add").send({ title: "Noop status", description: "d" })
    const id = String(created.body.feedback._id)

    const res = await wardenApi.put(`/api/v1/feedback/update-status/${id}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.feedback.status).toBe("Pending")
  })

  it("POST reply with an empty body marks Seen without setting a reply (documented)", async () => {
    const { api } = await authorWithAllocation()
    const created = await api.post("/api/v1/feedback/add").send({ title: "Empty reply", description: "d" })
    const id = String(created.body.feedback._id)

    const res = await wardenApi.post(`/api/v1/feedback/reply/${id}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.feedback.status).toBe("Seen")
    expect(res.body.feedback.reply).toBeNull()
  })

  it("any student can edit or delete ANOTHER student's feedback (documented IDOR)", async () => {
    // SUSPECTED BUG: PUT/DELETE /:feedbackId are guarded as Student-only but
    // never check ownership, so student B can tamper with student A's feedback.
    const a = await authorWithAllocation()
    const b = await authorWithAllocation()

    const createdA = await a.api
      .post("/api/v1/feedback/add")
      .send({ title: "A's private gripe", description: "only A should touch this" })
    const feedbackA = String(createdA.body.feedback._id)

    const editByB = await b.api.put(`/api/v1/feedback/${feedbackA}`).send({
      title: "Hijacked by B",
      description: "B was here",
    })
    expect(editByB.status).toBe(200)
    expect(editByB.body.feedback.title).toBe("Hijacked by B")

    const deleteByB = await b.api.delete(`/api/v1/feedback/${feedbackA}`)
    expect(deleteByB.status).toBe(200)

    const listA = await a.api.get("/api/v1/feedback")
    expect(listA.body.feedbacks).toHaveLength(0)
  })

  it("unrecognized ?status= values are ignored rather than rejected (documented)", async () => {
    // normalizeFeedbackStatus maps anything but pending/seen to null -> the
    // status filter silently disappears and ALL feedbacks come back.
    const res = await adminApi.get("/api/v1/feedback?status=nonsense")
    expect(res.status).toBe(200)
    expect(res.body.feedbacks.length).toBeGreaterThan(0)
  })

  it("pagination clamps limit into [1..100] and rejects non-numeric pages gracefully", async () => {
    const zeroLimit = await adminApi.get("/api/v1/feedback?page=1&limit=0")
    expect(zeroLimit.body.pagination.limit).toBe(1)

    const hugeLimit = await adminApi.get("/api/v1/feedback?page=1&limit=1000")
    expect(hugeLimit.body.pagination.limit).toBe(100)

    const badPage = await adminApi.get("/api/v1/feedback?page=abc")
    expect(badPage.status).toBe(200)
    expect(badPage.body.pagination.page).toBe(1)

    const beyond = await adminApi.get("/api/v1/feedback?page=9999")
    expect(beyond.status).toBe(200)
    expect(beyond.body.feedbacks).toEqual([])
    expect(beyond.body.pagination.totalPages).toBeGreaterThanOrEqual(0)
  })
})
