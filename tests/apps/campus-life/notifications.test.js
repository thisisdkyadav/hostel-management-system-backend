/**
 * Notifications module integration tests (/api/v1/notification).
 *
 * Legacy response style: controllers emit `result.data` directly. The list
 * endpoint responds `{ data: [...], meta: {...} }` (the payload key itself is
 * named "data"), stats respond `{ data: { total, active, expired } }`, and
 * active-count responds `{ activeCount }`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

const soon = () => new Date(Date.now() + 7 * 24 * 3600 * 1000)
const longPast = () => new Date(Date.now() - 24 * 3600 * 1000)

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("notifications — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.post("/api/v1/notification").send({})).status).toBe(401)
    expect((await api.get("/api/v1/notification")).status).toBe(401)
    expect((await api.get("/api/v1/notification/stats")).status).toBe(401)
    expect((await api.get("/api/v1/notification/active-count")).status).toBe(401)
  })

  it("POST / is Admin-only", async () => {
    const wardenApi = await as(await seed.warden())
    const res = await wardenApi
      .post("/api/v1/notification")
      .send({ title: "Warden tries", message: "nope" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)

    const studentApi = await as(await seed.student())
    expect(
      (await studentApi.post("/api/v1/notification").send({ title: "t", message: "m" })).status
    ).toBe(403)
  })

  it("reads reject roles outside Admin/Student/Warden/AW/HS", async () => {
    const securityApi = await as(await seed.security())
    expect((await securityApi.get("/api/v1/notification")).status).toBe(403)
    expect((await securityApi.get("/api/v1/notification/stats")).status).toBe(403)

    const maintenanceApi = await as(await seed.maintenanceStaff())
    expect((await maintenanceApi.get("/api/v1/notification/active-count")).status).toBe(403)
  })
})

describe("notifications — POST / (admin create)", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("500 when title/message are missing (documented current behavior)", async () => {
    // SUSPECTED BUG: missing input surfaces as 500 "Internal server error"
    // instead of a 4xx validation error.
    const res = await adminApi.post("/api/v1/notification").send({ message: "no title" })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("Internal server error")
  })

  it("201 happy path — creates a broadcast visible via GET", async () => {
    const res = await adminApi.post("/api/v1/notification").send({
      title: "Water supply maintenance",
      message: "No water on Sunday morning",
      expiryDate: soon(),
    })
    expect(res.status).toBe(201)
    expect(res.body.notification).toBeDefined()
    expect(res.body.notification.title).toBe("Water supply maintenance")
    expect(res.body.notification.type).toBe("announcement")
    expect(new Date(res.body.notification.expiryDate).getTime()).toBeGreaterThan(Date.now())

    const listRes = await adminApi.get("/api/v1/notification")
    expect(listRes.body.data.map((n) => n.title)).toContain("Water supply maintenance")
  })
})

describe("notifications — GET / targeting & filters", () => {
  let adminApi, hostelA, hostelB

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hostelA = await campusSeed.createHostel({ name: "Notif Hostel A" })
    hostelB = await campusSeed.createHostel({ name: "Notif Hostel B", gender: "Girls" })

    await adminApi
      .post("/api/v1/notification")
      .send({ title: "Global notice", message: "everyone", expiryDate: soon() })
    await adminApi.post("/api/v1/notification").send({
      title: "Hostel A notice",
      message: "only A",
      hostelId: [String(hostelA._id)],
      expiryDate: soon(),
    })
    await adminApi
      .post("/api/v1/notification")
      .send({ title: "Girls only", message: "female only", gender: "Female", expiryDate: soon() })
    await adminApi.post("/api/v1/notification").send({
      title: "MBA only",
      message: "degree targeting",
      degree: ["MBA"],
      expiryDate: soon(),
    })
    await adminApi
      .post("/api/v1/notification")
      .send({ title: "Expired notice", message: "old", expiryDate: longPast() })
  })

  it("unscoped staff sees every notification with meta envelope", async () => {
    const res = await adminApi.get("/api/v1/notification")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data).toHaveLength(6) // 5 here + one from the create suite
    expect(res.body.meta).toMatchObject({ totalCount: 6, totalPages: 1, currentPage: 1 })
  })

  it("students see global + matching-target notifications only", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { hostel: hostelA, gender: "Male", degree: "B.Tech", department: "CSE" },
    })
    const api = await as(user)
    const res = await api.get("/api/v1/notification")
    expect(res.status).toBe(200)
    // The plain list has no expiry filter — expired-but-targeted notices still
    // show up; only stats/active-count/expiryStatus separate them.
    expect(res.body.data.map((n) => n.title).sort()).toEqual([
      "Expired notice",
      "Global notice",
      "Hostel A notice",
      "Water supply maintenance",
    ])
  })

  it("student stats count only their scoped notifications", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { hostel: hostelA, gender: "Male", degree: "B.Tech", department: "CSE" },
    })
    const api = await as(user)
    const res = await api.get("/api/v1/notification/stats")
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ total: 4, active: 3, expired: 1 })
  })

  it("admin stats cover everything including expired", async () => {
    const res = await adminApi.get("/api/v1/notification/stats")
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ total: 6, active: 5, expired: 1 })
  })

  it("active-count reflects non-expired notifications", async () => {
    const res = await adminApi.get("/api/v1/notification/active-count")
    expect(res.status).toBe(200)
    expect(res.body.activeCount).toBe(5)
  })

  it("expiryStatus filter narrows the list", async () => {
    const expired = await adminApi.get("/api/v1/notification?expiryStatus=expired")
    expect(expired.body.data.map((n) => n.title)).toEqual(["Expired notice"])

    const active = await adminApi.get("/api/v1/notification?expiryStatus=active")
    expect(active.body.meta.totalCount).toBe(5)
  })

  it("500s when search is used (documented current behavior)", async () => {
    // SUSPECTED BUG: the search branch builds $or with { sender: regex } (and
    // regex-in-array for hostelId/degree/department), but `sender` is an
    // ObjectId path — mongoose throws a CastError and the endpoint returns
    // 500 "Internal server error" instead of filtered results.
    const res = await adminApi.get("/api/v1/notification?search=water%20supply")
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("Internal server error")
  })

  it("paginates", async () => {
    const res = await adminApi.get("/api/v1/notification?page=2&limit=2")
    expect(res.body.data).toHaveLength(2)
    expect(res.body.meta).toMatchObject({ totalCount: 6, totalPages: 3, currentPage: 2 })
  })

  it("500 for a student without any profile (documented current behavior)", async () => {
    // SUSPECTED BUG: getAll dereferences the (missing) student profile without
    // a null check, so profile-less students get a 500 instead of an empty list.
    const api = await as(await seed.student())
    const res = await api.get("/api/v1/notification")
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("Internal server error")
  })
})
