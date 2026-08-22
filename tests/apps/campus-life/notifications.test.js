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

  it("searches text fields without crashing", async () => {
    // The search branch no longer regexes ObjectId/array paths (CastError ->
    // 500); only title/message are searched.
    const res = await adminApi.get("/api/v1/notification?search=water%20supply")
    expect(res.status).toBe(200)
    expect(res.body.success).not.toBe(false)
    for (const n of res.body.data) {
      const haystack = `${n.title ?? ""} ${n.message ?? ""}`.toLowerCase()
      expect(haystack).toContain("water")
    }
  })

  it("escapes regex metacharacters in search", async () => {
    const res = await adminApi.get("/api/v1/notification?search=" + encodeURIComponent("a(b"))
    expect(res.status).toBe(200)
  })

  it("paginates", async () => {
    const res = await adminApi.get("/api/v1/notification?page=2&limit=2")
    expect(res.body.data).toHaveLength(2)
    expect(res.body.meta).toMatchObject({ totalCount: 6, totalPages: 3, currentPage: 2 })
  })

  it("200 with broadcast-only notifications for a student without any profile", async () => {
    // Profile-less students now see broadcast notifications instead of a 500.
    const api = await as(await seed.student())
    const res = await api.get("/api/v1/notification")
    expect(res.status).toBe(200)

    const stats = await api.get("/api/v1/notification/stats")
    expect(stats.status).toBe(200)
  })
})

describe("notifications — targeting intersection logic", () => {
  let adminApi, hostelC, hostelD

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hostelC = await campusSeed.createHostel({ name: "Notif Hostel C" })
    hostelD = await campusSeed.createHostel({ name: "Notif Hostel D", gender: "Girls" })

    // Fully-targeted: hostel C + B.Tech + CSE + Female only.
    await adminApi.post("/api/v1/notification").send({
      title: "CSE girls of hostel C",
      message: "intersection target",
      hostelId: [String(hostelC._id)],
      degree: ["B.Tech"],
      department: ["CSE"],
      gender: "Female",
      expiryDate: soon(),
    })
    // Same dimensions but hostel D, to prove each dimension must match.
    await adminApi.post("/api/v1/notification").send({
      title: "CSE girls of hostel D",
      message: "wrong hostel",
      hostelId: [String(hostelD._id)],
      degree: ["B.Tech"],
      department: ["CSE"],
      gender: "Female",
      expiryDate: soon(),
    })
  })

  it("a fully-matching student sees the intersection notification", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { hostel: hostelC, gender: "Female", degree: "B.Tech", department: "CSE" },
    })
    const res = await as(user).then((api) => api.get("/api/v1/notification"))
    expect(res.status).toBe(200)
    expect(res.body.data.map((n) => n.title)).toContain("CSE girls of hostel C")
  })

  it("students missing any single dimension do not see it", async () => {
    // Right hostel/degree/department, wrong gender.
    const wrongGender = await campusSeed.studentWithProfile({
      profile: { hostel: hostelC, gender: "Male", degree: "B.Tech", department: "CSE" },
    })
    const maleRes = await as(wrongGender.user).then((api) => api.get("/api/v1/notification"))
    expect(maleRes.body.data.map((n) => n.title)).not.toContain("CSE girls of hostel C")

    // Wrong hostel.
    const wrongHostel = await campusSeed.studentWithProfile({
      profile: { hostel: hostelD, gender: "Female", degree: "B.Tech", department: "CSE" },
    })
    const hostelRes = await as(wrongHostel.user).then((api) => api.get("/api/v1/notification"))
    expect(hostelRes.body.data.map((n) => n.title)).toContain("CSE girls of hostel D")
    expect(hostelRes.body.data.map((n) => n.title)).not.toContain("CSE girls of hostel C")

    // Wrong department.
    const wrongDept = await campusSeed.studentWithProfile({
      profile: { hostel: hostelC, gender: "Female", degree: "B.Tech", department: "ECE" },
    })
    const deptRes = await as(wrongDept.user).then((api) => api.get("/api/v1/notification"))
    expect(deptRes.body.data.map((n) => n.title)).not.toContain("CSE girls of hostel C")

    // Wrong degree.
    const wrongDegree = await campusSeed.studentWithProfile({
      profile: { hostel: hostelC, gender: "Female", degree: "MBA", department: "CSE" },
    })
    const degreeRes = await as(wrongDegree.user).then((api) => api.get("/api/v1/notification"))
    expect(degreeRes.body.data.map((n) => n.title)).not.toContain("CSE girls of hostel C")
  })

  it("invalid gender enum value is rejected by the model — currently as 500", async () => {
    // SUSPECTED BUG: an out-of-enum `gender` surfaces as a mongoose
    // ValidationError swallowed into a 500 instead of a 4xx validation error.
    const res = await adminApi
      .post("/api/v1/notification")
      .send({ title: "Bad gender", message: "m", gender: "Alien" })
    expect(res.status).toBe(500)
    expect(res.body.error).toBe("Internal server error")

    const listRes = await adminApi.get("/api/v1/notification?search=Bad%20gender")
    expect(listRes.body.data).toHaveLength(0)
  })

  it("invalid type enum value is likewise rejected with 500", async () => {
    // SUSPECTED BUG: same pattern for the `type` enum (only "announcement").
    const res = await adminApi
      .post("/api/v1/notification")
      .send({ title: "Bad type", message: "m", type: "emergency" })
    expect(res.status).toBe(500)
  })
})

describe("notifications — expiry boundary & stats consistency", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("a notification flips active -> expired exactly when expiryDate passes", async () => {
    const boundary = new Date(Date.now() + 1500)
    const createRes = await adminApi.post("/api/v1/notification").send({
      title: "Boundary notice",
      message: "expires in 1.5s",
      expiryDate: boundary,
    })
    expect(createRes.status).toBe(201)

    const beforeTitle = (await adminApi.get("/api/v1/notification?expiryStatus=active")).body.data
      .map((n) => n.title)
    expect(beforeTitle).toContain("Boundary notice")

    // Busy-wait until strictly past the stored expiry instant.
    while (Date.now() <= boundary.getTime()) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const activeTitles = (await adminApi.get("/api/v1/notification?expiryStatus=active")).body.data
      .map((n) => n.title)
    expect(activeTitles).not.toContain("Boundary notice")

    const expiredTitles = (await adminApi.get("/api/v1/notification?expiryStatus=expired")).body.data
      .map((n) => n.title)
    expect(expiredTitles).toContain("Boundary notice")
  })

  it("stats satisfy total === active + expired for the seeded mix (admin)", async () => {
    const res = await adminApi.get("/api/v1/notification/stats")
    expect(res.status).toBe(200)
    const { total, active, expired } = res.body.data
    expect(total).toBeGreaterThan(0)
    expect(active).toBeGreaterThan(0)
    expect(expired).toBeGreaterThan(0)
    expect(total).toBe(active + expired)

    const activeCountRes = await adminApi.get("/api/v1/notification/active-count")
    expect(activeCountRes.body.activeCount).toBe(active)
  })

  it("stats satisfy total === active + expired per student scope too", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { gender: "Male", degree: "B.Tech", department: "CSE" },
    })
    const api = await as(user)
    const stats = await api.get("/api/v1/notification/stats")
    const { total, active, expired } = stats.body.data
    expect(total).toBe(active + expired)

    const count = await api.get("/api/v1/notification/active-count")
    expect(count.body.activeCount).toBe(active)
  })
})

describe("notifications — list edge cases", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("pagination beyond the last page returns empty data but correct meta", async () => {
    const all = await adminApi.get("/api/v1/notification?limit=2&page=1")
    const totalCount = all.body.meta.totalCount

    const beyond = await adminApi.get("/api/v1/notification?limit=2&page=9999")
    expect(beyond.status).toBe(200)
    expect(beyond.body.data).toEqual([])
    expect(beyond.body.meta).toMatchObject({ totalCount, totalPages: Math.ceil(totalCount / 2), currentPage: 9999 })
  })

  it("unrecognized expiryStatus values are ignored (no filtering)", async () => {
    const plain = await adminApi.get("/api/v1/notification")
    const bogus = await adminApi.get("/api/v1/notification?expiryStatus=bogus")
    expect(bogus.status).toBe(200)
    expect(bogus.body.meta.totalCount).toBe(plain.body.meta.totalCount)
  })

  it("type filter matches exactly; unknown type yields no rows", async () => {
    const announcements = await adminApi.get("/api/v1/notification?type=announcement")
    expect(announcements.status).toBe(200)
    expect(announcements.body.data.length).toBeGreaterThan(0)
    expect(announcements.body.data.every((n) => n.type === "announcement")).toBe(true)

    const none = await adminApi.get("/api/v1/notification?type=no-such-type")
    expect(none.body.data).toEqual([])
    expect(none.body.meta.totalCount).toBe(0)
  })

  it("search handles special characters safely", async () => {
    await adminApi.post("/api/v1/notification").send({
      title: "Special (100%) notice",
      message: "C++ & regex [test] done\\",
      expiryDate: soon(),
    })
    // Each search term must occur inside a single field (title OR message).
    const titleHit = await adminApi.get(
      "/api/v1/notification?search=" + encodeURIComponent("(100%)")
    )
    expect(titleHit.status).toBe(200)
    expect(titleHit.body.data.map((n) => n.title)).toContain("Special (100%) notice")

    const messageHit = await adminApi.get(
      "/api/v1/notification?search=" + encodeURIComponent("[test] done\\")
    )
    expect(messageHit.status).toBe(200)
    expect(messageHit.body.data.map((n) => n.title)).toContain("Special (100%) notice")
  })
})

describe("notifications — hostel-scoped staff view", () => {
  let adminApi, scopedWarden, hostelE, hostelF

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hostelE = await campusSeed.createHostel({ name: "Notif Hostel E" })
    hostelF = await campusSeed.createHostel({ name: "Notif Hostel F" })
    await adminApi
      .post("/api/v1/notification")
      .send({ title: "E-only marker alpha", message: "for E", hostelId: [String(hostelE._id)], expiryDate: soon() })
    await adminApi
      .post("/api/v1/notification")
      .send({ title: "F-only marker beta", message: "for F", hostelId: [String(hostelF._id)], expiryDate: soon() })

    const wardenUser = await seed.warden()
    scopedWarden = await as(wardenUser, {
      userData: { hostel: { _id: String(hostelE._id), name: hostelE.name, type: hostelE.type } },
    })
  })

  it("without search, a hostel-scoped warden sees only their hostel's notices", async () => {
    const res = await scopedWarden.get("/api/v1/notification")
    expect(res.status).toBe(200)
    const titles = res.body.data.map((n) => n.title)
    expect(titles).toContain("E-only marker alpha")
    expect(titles).not.toContain("F-only marker beta")
    // SUSPECTED BUG: global broadcast notices (hostelId []) are hidden from
    // hostel-scoped staff because the staff branch filters with strict
    // equality on hostelId and never includes the size-0/broadcast branch.
  })

  it("hostel scoping survives search (hostelId equality is independent of $or)", async () => {
    // The staff branch filters with strict equality on hostelId, which stays
    // in place when a search term replaces queryObj.$or — other hostels'
    // notices stay hidden even while searching.
    const res = await scopedWarden.get("/api/v1/notification?search=marker")
    expect(res.status).toBe(200)
    const titles = res.body.data.map((n) => n.title)
    expect(titles).toContain("E-only marker alpha")
    expect(titles).not.toContain("F-only marker beta")
  })
})
