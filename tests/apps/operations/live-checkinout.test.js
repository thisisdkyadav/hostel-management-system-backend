import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createHostel,
  createCheckInOutEntry,
} from "../../helpers/seed/operations.js"

const BASE = "/api/v1/live-checkinout"

let admin, superAdmin, student
let hostelA, hostelB
let gateUserA

beforeAll(async () => {
  await setupTestDb()

  admin = await seed.admin()
  superAdmin = await seed.superAdmin()
  student = await seed.student()
  gateUserA = await seed.student({ name: "Gate Student A" })

  hostelA = await createHostel({ name: "Live Hostel A", type: "room-only" })
  hostelB = await createHostel({ name: "Live Hostel B", type: "unit-based" })

  const now = new Date()
  const todayAt = (h, m = 0) => {
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    return d
  }
  const yesterday = new Date(now.getTime() - 86400000)

  // Today's entries in Hostel A
  await createCheckInOutEntry({
    userId: gateUserA._id,
    hostelId: hostelA._id,
    hostelName: hostelA.name,
    room: "101",
    bed: "1",
    status: "Checked In",
    isSameHostel: true,
    dateAndTime: todayAt(8, 15),
  })
  await createCheckInOutEntry({
    userId: gateUserA._id,
    hostelId: hostelA._id,
    hostelName: hostelA.name,
    room: "101",
    bed: "1",
    status: "Checked Out",
    isSameHostel: true,
    reason: "Home visit",
    dateAndTime: todayAt(9, 30),
  })
  // Cross-hostel entry in Hostel B
  await createCheckInOutEntry({
    userId: student._id,
    hostelId: hostelB._id,
    hostelName: hostelB.name,
    room: "202",
    unit: "U1",
    bed: "2",
    status: "Checked In",
    isSameHostel: false,
    dateAndTime: todayAt(10, 45),
  })
  // Yesterday's entry — must NOT appear in hostel-wise/today stats
  await createCheckInOutEntry({
    userId: student._id,
    hostelId: hostelA._id,
    hostelName: hostelA.name,
    room: "103",
    bed: "1",
    status: "Checked In",
    isSameHostel: true,
    dateAndTime: yesterday,
  })
})

afterAll(async () => {
  await teardownTestDb()
})

describe("authz for every /live-checkinout route", () => {
  const paths = ["/entries", "/stats/hostel-wise", "/recent", "/analytics/time-based"]

  it("401 when unauthenticated", async () => {
    const api = await anon()
    for (const p of paths) {
      const res = await api.get(`${BASE}${p}`)
      expect(res.status).toBe(401)
    }
  })

  it("403 for Student and Warden (Admin/Super Admin only)", async () => {
    for (const user of [student, await seed.warden()]) {
      const api = await as(user)
      for (const p of paths) {
        const res = await api.get(`${BASE}${p}`)
        expect(res.status).toBe(403)
        expect(res.body.success).toBe(false)
      }
    }
  })

  it("200 for Super Admin (mapped to route.superAdmin.dashboard)", async () => {
    const api = await as(superAdmin)
    for (const p of paths) {
      const res = await api.get(`${BASE}${p}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })
})

describe("GET /api/v1/live-checkinout/entries", () => {
  it("returns the live feed with populated refs, pagination and stats", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    expect(res.body.data).toHaveLength(4)
    // sorted newest first
    const times = res.body.data.map((e) => new Date(e.dateAndTime).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)

    const top = res.body.data[0]
    expect(top.userId.name).toBeDefined()
    expect(top.hostelId.name).toBeDefined()
    expect(top.hostelId.type).toBeDefined()

    expect(res.body.pagination).toMatchObject({ total: 4, page: 1, limit: 20, totalPages: 1 })

    // Stats: totals across everything + today-only slice
    expect(res.body.stats.total.checkedIn).toBe(3)
    expect(res.body.stats.total.checkedOut).toBe(1)
    expect(res.body.stats.today.checkedIn).toBe(2)
    expect(res.body.stats.today.checkedOut).toBe(1)
    expect(res.body.stats.today.sameHostel).toBe(2)
    expect(res.body.stats.today.crossHostel).toBe(1)
    expect(res.body.stats.today.total).toBe(3)
  })

  it("filters by status", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ status: "Checked Out" })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].status).toBe("Checked Out")
    expect(res.body.pagination.total).toBe(1)
  })

  it("filters by hostelId", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(hostelB._id) })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(String(res.body.data[0].hostelId._id)).toBe(String(hostelB._id))
  })

  it("filters by isSameHostel=true/false", async () => {
    const api = await as(admin)
    const cross = await api.get(`${BASE}/entries`).query({ isSameHostel: "false" })
    expect(cross.body.data).toHaveLength(1)
    expect(cross.body.data[0].isSameHostel).toBe(false)

    const same = await api.get(`${BASE}/entries`).query({ isSameHostel: "true" })
    expect(same.body.data).toHaveLength(3)
  })

  it("searches across room/unit/bed/reason/hostelName", async () => {
    const api = await as(admin)
    const byRoom = await api.get(`${BASE}/entries`).query({ search: "202" })
    expect(byRoom.body.data).toHaveLength(1)
    expect(byRoom.body.data[0].room).toBe("202")

    const byReason = await api.get(`${BASE}/entries`).query({ search: "home visit" })
    expect(byReason.body.data).toHaveLength(1)
    expect(byReason.body.data[0].reason).toBe("Home visit")
  })

  it("filters by date range (startDate/endDate)", async () => {
    const api = await as(admin)
    const yesterday = new Date(Date.now() - 86400000)
    const y = yesterday.toISOString().slice(0, 10)
    const res = await api.get(`${BASE}/entries`).query({ startDate: y, endDate: y })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(new Date(res.body.data[0].dateAndTime).getDate()).toBe(yesterday.getDate())
  })

  it("paginates with page/limit", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ page: 2, limit: 3 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.pagination).toMatchObject({ total: 4, page: 2, limit: 3, totalPages: 2 })
  })

  it("sorts ascending when sortOrder=asc", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ sortOrder: "asc" })
    const times = res.body.data.map((e) => new Date(e.dateAndTime).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})

describe("GET /api/v1/live-checkinout/stats/hostel-wise", () => {
  it("aggregates today's entries per hostel", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/stats/hostel-wise`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const rows = res.body.data
    expect(rows).toHaveLength(2)

    const a = rows.find((r) => String(r.hostelId) === String(hostelA._id))
    const b = rows.find((r) => String(r.hostelId) === String(hostelB._id))

    // Hostel A: 1 today's check-in + 1 check-out (+1 yesterday excluded)
    expect(a.hostelName).toBe(hostelA.name)
    expect(a.checkedIn).toBe(1)
    expect(a.checkedOut).toBe(1)
    expect(a.crossHostel).toBe(0)
    expect(a.total).toBe(2)

    // Hostel B: 1 cross-hostel check-in
    expect(b.hostelName).toBe(hostelB.name)
    expect(b.checkedIn).toBe(1)
    expect(b.crossHostel).toBe(1)
    expect(b.total).toBe(1)

    // sorted by total desc
    expect(rows[0].total).toBeGreaterThanOrEqual(rows[1].total)
  })
})

describe("GET /api/v1/live-checkinout/recent", () => {
  it("returns the most recent activity, honoring limit", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/recent`).query({ limit: 2 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)

    const times = res.body.data.map((e) => new Date(e.dateAndTime).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    // newest overall is the 10:45 cross-hostel entry
    expect(res.body.data[0].room).toBe("202")
    expect(res.body.data[0].userId.name).toBeDefined()
  })

  it("defaults to a larger limit and returns everything when under the cap", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/recent`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(4)
  })
})

describe("GET /api/v1/live-checkinout/analytics/time-based", () => {
  it("returns 24 hourly buckets for today including zero-filled hours", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/analytics/time-based`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(24)
    expect(res.body.data.map((b) => b.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i))

    const totalToday = res.body.data.reduce((acc, b) => acc + b.total, 0)
    expect(totalToday).toBe(3)

    // The 10:45 entry lands in the UTC hour bucket of its stored timestamp
    const tenAm = new Date()
    tenAm.setHours(10, 45, 0, 0)
    const bucket = res.body.data.find((b) => b.hour === tenAm.getUTCHours())
    expect(bucket.checkedIn).toBe(1)
    expect(bucket.checkedOut).toBe(0)
  })

  it("accepts an explicit date and zeroes out empty days", async () => {
    const api = await as(admin)
    const target = "2026-01-15T10:30:00.000Z"
    const res = await api.get(`${BASE}/analytics/time-based`).query({ date: target })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(24)
    expect(res.body.data.every((b) => b.total === 0)).toBe(true)

    const expectedMidnight = new Date(target)
    expectedMidnight.setHours(0, 0, 0, 0)
    expect(new Date(res.body.date).toISOString()).toBe(expectedMidnight.toISOString())
  })
})

// ---------------------------------------------------------------------------
// Hardening: pagination/filter/analytics edges. New entries use a dedicated
// hostel so assertions stay independent of the fixtures above.
// ---------------------------------------------------------------------------
describe("GET /entries — pagination/filter edges", () => {
  let edgeHostel

  beforeAll(async () => {
    edgeHostel = await createHostel({ name: "Live Edge Hostel" })
    await createCheckInOutEntry({
      userId: admin._id,
      hostelId: edgeHostel._id,
      hostelName: edgeHostel.name,
      room: "E1",
      bed: "1",
      status: "Checked In",
      isSameHostel: true,
    })
    await createCheckInOutEntry({
      userId: admin._id,
      hostelId: edgeHostel._id,
      hostelName: edgeHostel.name,
      room: "E2",
      bed: "2",
      status: "Checked Out",
      isSameHostel: false,
    })
  })

  it("500 for page=0 (negative skip reaches Mongo)", async () => {
    // SUSPECTED BUG: page is parsed but never validated; skip goes negative.
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), page: 0, limit: 20 })
    expect([200, 500]).toContain(res.status)
    if (res.status === 500) {
      expect(res.body.success).toBe(false)
    }
  })

  it("SUSPECTED BUG: non-numeric page returns 200 with pagination.page null (NaN skip silently tolerated)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), page: "abc", limit: 20 })
    // Current behavior: parseInt('abc') = NaN reaches Mongo, is treated as no
    // skip, and page serializes as null instead of erroring.
    expect(res.status).toBe(200)
    expect(res.body.pagination.page).toBeNull()
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
  })

  it("200 honors limit=1000 and returns the full filtered set in one page", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), limit: 1000, page: 1 })
    expect(res.status).toBe(200)
    expect(res.body.pagination.limit).toBe(1000)
    expect(res.body.pagination.total).toBe(2)
    expect(res.body.data).toHaveLength(2)
  })

  it("200 returns an empty second page beyond totalPages", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), limit: 1, page: 5 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(res.body.pagination.total).toBe(2)
    expect(res.body.pagination.totalPages).toBe(2)
  })

  it("SUSPECTED BUG: an invalid status value empties the list but stats ignore it", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), status: "Teleported" })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    // calculateCheckInOutStats spreads the base query then overrides `status`
    // per counter, so the bogus status never reaches the stat queries and the
    // totals still count the hostel's real entries.
    expect(res.body.stats.total.checkedIn + res.body.stats.total.checkedOut).toBe(2)
  })

  it("200 start>end date range matches nothing instead of erroring", async () => {
    const api = await as(admin)
    const now = new Date().toISOString().slice(0, 10)
    const later = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    const res = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), startDate: later, endDate: now })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it("SUSPECTED BUG: any isSameHostel value other than 'true' silently means false", async () => {
    const api = await as(admin)
    const garbage = await api.get(`${BASE}/entries`).query({ hostelId: String(edgeHostel._id), isSameHostel: "banana" })
    expect(garbage.status).toBe(200)
    // 'banana' !== 'true' -> query.isSameHostel = false -> only cross-hostel rows
    expect(garbage.body.data.every((e) => e.isSameHostel === false)).toBe(true)
    expect(garbage.body.data).toHaveLength(1)
  })

  it("400 Invalid ID format for malformed dates in range filters (query CastError)", async () => {
    // new Date('not-a-date') is an Invalid Date; Mongoose's query casting
    // throws a CastError, which the global handler maps to the generic
    // "Invalid ID format" 400 — even though this is a date problem.
    const api = await as(admin)
    const res = await api
      .get(`${BASE}/entries`)
      .query({ hostelId: String(edgeHostel._id), startDate: "not-a-date", endDate: "also-bad" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })
})

describe("GET /recent & /analytics/time-based — edge inputs", () => {
  it("recent: 500 or clamped behavior for non-numeric limit", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/recent`).query({ limit: "abc" })
    // parseInt('abc') = NaN reaches Mongo's limit; document actual handling.
    expect([200, 400, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(Array.isArray(res.body.data)).toBe(true)
    }
  })

  it("SUSPECTED BUG: limit=0 returns everything — Mongo treats limit 0 as no limit", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/recent`).query({ limit: 0 })
    expect(res.status).toBe(200)
    // Current behavior: parseInt('0') = 0 reaches Mongo where 0 disables the
    // cap, so the "timeline" is unbounded rather than empty.
    expect(res.body.data.length).toBeGreaterThanOrEqual(1)
  })

  it("analytics: unparseable date does not hang or return wrong bucket count", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/analytics/time-based`).query({ date: "not-a-date" })
    expect([200, 500]).toContain(res.status)
    if (res.status === 200) {
      expect(res.body.data).toHaveLength(24)
    }
  })

  it("analytics: extreme dates (1900 / 2999) yield 24 zero-filled buckets", async () => {
    const api = await as(admin)
    for (const d of ["1900-06-15T00:00:00.000Z", "2999-06-15T00:00:00.000Z"]) {
      const res = await api.get(`${BASE}/analytics/time-based`).query({ date: d })
      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(24)
      expect(res.body.data.every((b) => b.total === 0)).toBe(true)
    }
  })

  it("stats/hostel-wise: 200 even when no entries exist today beyond seeds", async () => {
    const api = await as(superAdmin)
    const res = await api.get(`${BASE}/stats/hostel-wise`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })
})
