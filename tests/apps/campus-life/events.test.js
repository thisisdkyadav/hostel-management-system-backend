/**
 * Events module integration tests (/api/v1/event).
 *
 * Legacy response style: controllers emit `result.data` directly. The
 * success() message-hoist means POST responds `{ event }`, PUT responds
 * `{ success: true, event }` and DELETE responds `{ success: true }`.
 *
 * GET results are served through a Redis-backed common cache that is refreshed
 * on every write; we force a refresh in beforeAll so stale entries from other
 * test files (shared Redis keys) cannot leak into assertions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

const future = (hours) => new Date(Date.now() + hours * 3600 * 1000)
const past = (hours) => new Date(Date.now() - hours * 3600 * 1000)

async function refreshEventsCache() {
  const { refreshCommonCache } = await import("../../../src/services/cache/commonData.cache.js")
  await refreshCommonCache("events", { useLock: false })
}

beforeAll(async () => {
  await setupTestDb()
  await refreshEventsCache()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("events — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.get("/api/v1/event")).status).toBe(401)
    expect((await api.post("/api/v1/event").send({})).status).toBe(401)
    expect((await api.put("/api/v1/event/000000000000000000000000").send({})).status).toBe(401)
    expect((await api.delete("/api/v1/event/000000000000000000000000")).status).toBe(401)
  })

  it("GET is open to staff and students; writes are Admin-only", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/event")).status).toBe(200)
    expect((await studentApi.post("/api/v1/event").send({})).status).toBe(403)

    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.get("/api/v1/event")).status).toBe(200)
    expect(
      (await wardenApi.post("/api/v1/event").send({ eventName: "X", description: "Y", dateAndTime: future(24) }))
        .status
    ).toBe(403)

    const securityApi = await as(await seed.security())
    expect((await securityApi.get("/api/v1/event")).status).toBe(403)
  })
})

describe("events — POST / (admin create)", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("500 when required model fields are missing (documented current behavior)", async () => {
    // SUSPECTED BUG: missing input surfaces as 500 "Failed to create Event"
    // instead of a 4xx validation error.
    const res = await adminApi.post("/api/v1/event").send({ eventName: "No date event" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to create Event")
  })

  it("201 happy path — creates an event visible via GET", async () => {
    const hostel = await campusSeed.createHostel()
    const res = await adminApi.post("/api/v1/event").send({
      eventName: "Freshers Night",
      description: "Welcome party for new students",
      dateAndTime: future(48),
      hostelId: String(hostel._id),
      gender: "Male",
    })
    expect(res.status).toBe(201)
    expect(res.body.event).toBeDefined()
    expect(res.body.event.eventName).toBe("Freshers Night")
    expect(String(res.body.event.hostelId)).toBe(String(hostel._id))
    expect(res.body.event.gender).toBe("Male")

    const listRes = await adminApi.get("/api/v1/event?search=Freshers")
    expect(listRes.body.events.map((e) => e.eventName)).toContain("Freshers Night")
  })

  it("rejects a gender outside the enum", async () => {
    const res = await adminApi.post("/api/v1/event").send({
      eventName: "Bad gender",
      description: "x",
      dateAndTime: future(24),
      gender: "Alien",
    })
    // ValidationError is caught by the service and surfaced as its generic 500.
    expect([400, 422, 500]).toContain(res.status)
  })
})

describe("events — GET / (list, scoping, filters)", () => {
  let adminApi, hostelA, hostelB

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    hostelA = await campusSeed.createHostel({ name: "Events Hostel A" })
    hostelB = await campusSeed.createHostel({ name: "Events Hostel B", gender: "Girls" })

    await adminApi.post("/api/v1/event").send({
      eventName: "Global Upcoming",
      description: "everyone sees this",
      dateAndTime: future(10),
    })
    await adminApi.post("/api/v1/event").send({
      eventName: "A Male Upcoming",
      description: "hostel A boys",
      dateAndTime: future(20),
      hostelId: String(hostelA._id),
      gender: "Male",
    })
    await adminApi.post("/api/v1/event").send({
      eventName: "A Female Upcoming",
      description: "hostel A girls only",
      dateAndTime: future(30),
      hostelId: String(hostelA._id),
      gender: "Female",
    })
    await adminApi.post("/api/v1/event").send({
      eventName: "Old Past Event",
      description: "already happened",
      dateAndTime: past(5),
    })
    await refreshEventsCache()
  })

  it("unscoped admin sees all events with pagination + stats + filters envelope", async () => {
    const res = await adminApi.get("/api/v1/event")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.events)).toBe(true)
    expect(res.body.events).toHaveLength(5) // 4 here + "Freshers Night" from the create suite
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10, total: 5, totalPages: 1, hasMore: false })
    expect(res.body.stats).toMatchObject({ total: 5, upcoming: 4, past: 1 })
    expect(new Date(res.body.stats.nextEventDate).getTime()).toBeGreaterThan(Date.now())
    expect(res.body.filters).toEqual({ filter: "all", search: "" })
  })

  it("upcoming/past filters work", async () => {
    const upcoming = await adminApi.get("/api/v1/event?filter=upcoming")
    expect(upcoming.body.events).toHaveLength(4)
    expect(upcoming.body.events.every((e) => new Date(e.dateAndTime).getTime() > Date.now())).toBe(true)

    const pastRes = await adminApi.get("/api/v1/event?filter=past")
    expect(pastRes.body.events).toHaveLength(1)
    expect(pastRes.body.events[0].eventName).toBe("Old Past Event")
  })

  it("search matches eventName or description case-insensitively", async () => {
    const byName = await adminApi.get("/api/v1/event?search=global")
    expect(byName.body.events.map((e) => e.eventName)).toEqual(["Global Upcoming"])

    const byDesc = await adminApi.get("/api/v1/event?search=ALREADY HAPPENED")
    expect(byDesc.body.events.map((e) => e.eventName)).toEqual(["Old Past Event"])
  })

  it("paginates", async () => {
    const res = await adminApi.get("/api/v1/event?limit=2&page=2&filter=past")
    // Only one past event exists → page 2 is empty but pagination math holds.
    expect(res.body.events).toHaveLength(0)
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, total: 1, hasMore: false })
  })

  it("students only see global events and same-hostel/same-gender events", async () => {
    const { user } = await campusSeed.studentWithProfile({
      profile: { gender: "Male", hostel: hostelA },
    })
    const api = await as(user)
    const res = await api.get("/api/v1/event")
    expect(res.status).toBe(200)
    const names = res.body.events.map((e) => e.eventName).sort()
    // Global events (no hostel/gender) + same-hostel same-gender event.
    expect(names).toEqual(["A Male Upcoming", "Global Upcoming", "Old Past Event"])
    expect(res.body.stats.total).toBe(3)
  })

  it("students without any profile still get a scoped, non-crashing list", async () => {
    const api = await as(await seed.student())
    const res = await api.get("/api/v1/event")
    expect(res.status).toBe(200)
    // No allocation/gender → only fully-global events match.
    expect(res.body.events.map((e) => e.eventName).sort()).toEqual([
      "Global Upcoming",
      "Old Past Event",
    ])
  })
})

describe("events — PUT /:id and DELETE /:id", () => {
  let adminApi, eventId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    const res = await adminApi.post("/api/v1/event").send({
      eventName: "Editable Event",
      description: "before edit",
      dateAndTime: future(12),
    })
    eventId = res.body.event._id
  })

  it("404 for unknown id", async () => {
    const res = await adminApi
      .put("/api/v1/event/000000000000000000000000")
      .send({ eventName: "nope", description: "nope", dateAndTime: future(1) })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Event not found")

    expect((await adminApi.delete("/api/v1/event/000000000000000000000000")).status).toBe(404)
  })

  it("500 for malformed id (documented current behavior)", async () => {
    // SUSPECTED BUG: CastError is swallowed by the service try/catch → 500
    // instead of the global handler's 400 "Invalid ID format".
    expect(
      (await adminApi.put("/api/v1/event/garbage").send({ eventName: "x" })).status
    ).toBe(500)
  })

  it("200 update persists and is reflected in GET", async () => {
    const res = await adminApi.put(`/api/v1/event/${eventId}`).send({
      eventName: "Edited Event",
      description: "after edit",
      dateAndTime: future(72),
      gender: null,
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.event.eventName).toBe("Edited Event")

    const listRes = await adminApi.get("/api/v1/event?search=edited")
    expect(listRes.body.events.map((e) => e.eventName)).toContain("Edited Event")
  })

  it("200 delete removes the event", async () => {
    const res = await adminApi.delete(`/api/v1/event/${eventId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const listRes = await adminApi.get("/api/v1/event?search=edited")
    expect(listRes.body.events).toHaveLength(0)
  })
})
