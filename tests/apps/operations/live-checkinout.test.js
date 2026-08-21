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
