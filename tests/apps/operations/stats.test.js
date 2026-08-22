import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createHostel,
  createRoom,
  createWardenProfile,
  createSecurityProfile,
  createMaintenanceProfile,
  createVisitor,
  createComplaint,
  createEvent,
  createLostFoundItem,
} from "../../helpers/seed/operations.js"

const BASE = "/api/v1/stats"

let student
let hostelA

beforeAll(async () => {
  await setupTestDb()
  student = await seed.student()

  hostelA = await createHostel({ name: "Stats Hostel A", type: "room-only" })
  const hostelB = await createHostel({ name: "Stats Hostel B", type: "unit-based" })

  // Rooms: A occupied+active, B vacant+active, C inactive (vacant)
  await createRoom({ hostelId: hostelA._id, roomNumber: "101", capacity: 2, occupancy: 1 })
  await createRoom({ hostelId: hostelA._id, roomNumber: "102", capacity: 2, occupancy: 0 })
  await createRoom({ hostelId: hostelA._id, roomNumber: "103", capacity: 0, status: "Inactive" })

  // Warden profiles: one assigned, one unassigned
  await createWardenProfile({ userId: (await seed.warden())._id, activeHostelId: hostelA._id })
  await createWardenProfile({ userId: (await seed.warden())._id })

  // Security profiles (hostelId is required by the model, so all count as assigned)
  await createSecurityProfile({ userId: (await seed.security())._id, hostelId: hostelA._id })
  await createSecurityProfile({ userId: (await seed.security())._id, hostelId: hostelB._id })

  // Maintenance profiles by category
  await createMaintenanceProfile({ userId: (await seed.maintenanceStaff())._id, category: "Plumbing" })
  await createMaintenanceProfile({ userId: (await seed.maintenanceStaff())._id, category: "Electrical" })
  await createMaintenanceProfile({ userId: (await seed.maintenanceStaff())._id, category: "Electrical" })

  // Visitors in hostelA
  await createVisitor({ hostelId: hostelA._id, name: "V In 1", status: "Checked In" })
  await createVisitor({ hostelId: hostelA._id, name: "V In 2", status: "Checked In" })
  await createVisitor({ hostelId: hostelA._id, name: "V Out", status: "Checked Out" })

  // Complaints
  await createComplaint({ userId: student._id, status: "Pending" })
  await createComplaint({ userId: student._id, status: "Pending" })
  await createComplaint({ userId: student._id, status: "Resolved" })
  await createComplaint({ userId: student._id, status: "In Progress" })

  // Events in hostelA: one upcoming, one past
  await createEvent({ hostelId: hostelA._id, dateAndTime: new Date(Date.now() + 7 * 86400000) })
  await createEvent({ hostelId: hostelA._id, dateAndTime: new Date(Date.now() - 7 * 86400000) })

  // Lost & found
  await createLostFoundItem({ status: "Active" })
  await createLostFoundItem({ status: "Active" })
  await createLostFoundItem({ status: "Claimed" })
})

afterAll(async () => {
  await teardownTestDb()
})

describe("auth for /api/v1/stats/*", () => {
  it("401 when unauthenticated on every route", async () => {
    const api = await anon()
    const paths = [
      "/hostel",
      "/lostandfound",
      "/security",
      "/maintenancestaff",
      `/room/${hostelA._id}`,
      `/visitor/${hostelA._id}`,
      `/event/${hostelA._id}`,
      "/wardens",
      "/complaints",
    ]
    for (const p of paths) {
      const res = await api.get(`${BASE}${p}`)
      expect(res.status).toBe(401)
    }
  })

  it("any authenticated role may read stats (no role gate)", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/complaints`)
    expect(res.status).toBe(200)
  })
})

describe("GET /api/v1/stats/hostel", () => {
  it("returns global hostel/room occupancy stats", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/hostel`)
    expect(res.status).toBe(200)
    expect(res.body.totalHostels).toBe(2)
    // Only Active rooms are counted globally
    expect(res.body.totalRooms).toBe(2)
    expect(res.body.availableRooms).toBe(1)
    expect(res.body.occupancyRate).toBe(50)
  })
})

describe("GET /api/v1/stats/room/:hostelId", () => {
  it("returns per-hostel room counts including inactive rooms", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/room/${hostelA._id}`)
    expect(res.status).toBe(200)
    // Unlike the global stats, this counts every room document
    expect(res.body).toEqual({ totalRooms: 3, availableRooms: 2, occupiedRooms: 1 })
  })
})

describe("GET /api/v1/stats/wardens", () => {
  it("counts wardens by assignment status", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/wardens`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 2, assigned: 1, unassigned: 1 })
  })
})

describe("GET /api/v1/stats/security", () => {
  it("counts security staff; unassigned is always 0 because Security.hostelId is required", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/security`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.assigned).toBe(2)
    expect(res.body.unassigned).toBe(0)
  })
})

describe("GET /api/v1/stats/maintenancestaff", () => {
  it("breaks maintenance staff down by category", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/maintenancestaff`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      total: 3,
      plumbing: 1,
      electrical: 2,
      cleanliness: 0,
      internet: 0,
      civil: 0,
    })
  })
})

describe("GET /api/v1/stats/visitor/:hostelId", () => {
  it("counts visitors by status", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/visitor/${hostelA._id}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(3)
    expect(res.body.checkedIn).toBe(2)
    expect(res.body.checkedOut).toBe(1)
    // all fixtures were created now, so today's count covers all 3
    expect(res.body.todays).toBe(3)
  })
})

describe("GET /api/v1/stats/event/:hostelId", () => {
  it("splits events into upcoming and past", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/event/${hostelA._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 2, upcoming: 1, past: 1 })
  })
})

describe("GET /api/v1/stats/complaints", () => {
  it("counts complaints by status", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/complaints`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 4, pending: 2, resolved: 1, inProgress: 1 })
  })
})

describe("GET /api/v1/stats/lostandfound", () => {
  it("counts items by status", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/lostandfound`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 3, active: 2, claimed: 1 })
  })
})

describe("stats — empty scopes report zeros", () => {
  it("a hostel with no rooms, visitors, or events yields all-zero counters", async () => {
    const emptyHostel = await createHostel({ name: "Stats Empty Hostel", type: "room-only" })
    const api = await as(student)

    const rooms = await api.get(`${BASE}/room/${emptyHostel._id}`)
    expect(rooms.status).toBe(200)
    expect(rooms.body).toEqual({ totalRooms: 0, availableRooms: 0, occupiedRooms: 0 })

    const visitors = await api.get(`${BASE}/visitor/${emptyHostel._id}`)
    expect(visitors.status).toBe(200)
    expect(visitors.body).toEqual({ total: 0, checkedIn: 0, checkedOut: 0, todays: 0 })

    const events = await api.get(`${BASE}/event/${emptyHostel._id}`)
    expect(events.status).toBe(200)
    expect(events.body).toEqual({ total: 0, upcoming: 0, past: 0 })
  })

  it("a well-formed but unknown hostel id yields zeros instead of a 404", async () => {
    const { Types } = await import("mongoose")
    const api = await as(student)
    const res = await api.get(`${BASE}/room/${new Types.ObjectId().toString()}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ totalRooms: 0, availableRooms: 0, occupiedRooms: 0 })
  })
})
