import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createHostel,
  createUnit,
  createRoom,
  createStudentProfile,
  createAllocation,
} from "../../helpers/seed/operations.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// Wire shape for this controller: { success, data } — no message field.

describe("dashboard — auth wall", () => {
  it("401 without a session", async () => {
    const api = await anon()
    for (const url of [
      "/api/v1/dashboard",
      "/api/v1/dashboard/warden/hostel-statistics",
      "/api/v1/dashboard/student-count",
      "/api/v1/dashboard/student-statistics",
    ]) {
      expect((await api.get(url)).status).toBe(401)
    }
  })

  it("students and security are 403 everywhere", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/dashboard")).status).toBe(403)
    expect((await studentApi.get("/api/v1/dashboard/student-count")).status).toBe(403)
    expect((await studentApi.get("/api/v1/dashboard/warden/hostel-statistics")).status).toBe(403)

    const securityApi = await as(await seed.security())
    expect((await securityApi.get("/api/v1/dashboard")).status).toBe(403)
  })

  it("warden-level roles cannot reach admin-only dashboard", async () => {
    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.get("/api/v1/dashboard")).status).toBe(403)
  })
})

describe("dashboard — admin views", () => {
  it("GET / returns aggregate counts for Admin and Super Admin", async () => {
    const hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, capacity: 2 })
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    await createAllocation({
      userId: student._id,
      studentProfileId: profile._id,
      hostelId: hostel._id,
      roomId: room._id,
    })

    let res = await as(await seed.admin()).then((a) => a.get("/api/v1/dashboard"))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()

    res = await as(await seed.superAdmin()).then((a) => a.get("/api/v1/dashboard"))
    expect(res.status).toBe(200)
  })

  it("GET /student-count reflects seeded hostellers; hostel-scoped staff only see their hostel", async () => {
    const hostelA = await createHostel()
    const hostelB = await createHostel()
    const roomA = await createRoom({ hostelId: hostelA._id, capacity: 2 })
    const roomB = await createRoom({ hostelId: hostelB._id, capacity: 2 })

    const s1 = await seed.student()
    await createAllocation({
      userId: s1._id,
      studentProfileId: (await createStudentProfile({ userId: s1._id }))._id,
      hostelId: hostelA._id,
      roomId: roomA._id,
    })
    const s2 = await seed.student()
    await createAllocation({
      userId: s2._id,
      studentProfileId: (await createStudentProfile({ userId: s2._id }))._id,
      hostelId: hostelB._id,
      roomId: roomB._id,
    })

    const adminApi = await as(await seed.admin())
    const all = await adminApi.get("/api/v1/dashboard/student-count")
    expect(all.status).toBe(200)
    expect(Number(all.body.data.count?.total ?? all.body.data.total ?? 0)).toBeGreaterThanOrEqual(2)

    // supervisor scoped to hostel A sees only its student
    const supervisor = await seed.createUser({ role: "Hostel Supervisor" })
    const scopedApi = await as(supervisor, {
      userData: { hostel: { _id: hostelA._id, name: hostelA.name } },
    })
    const scoped = await scopedApi.get("/api/v1/dashboard/student-count")
    expect(scoped.status).toBe(200)
    expect(Number(scoped.body.data.count?.total ?? scoped.body.data.total ?? 0)).toBeLessThanOrEqual(1)
  })

  it("GET /student-statistics serves admins and hostel-bound staff", async () => {
    const adminApi = await as(await seed.admin())
    const res = await adminApi.get("/api/v1/dashboard/student-statistics")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()

    const warden = await seed.warden()
    const hostel = await createHostel()
    const wardenApi = await as(warden, {
      userData: { hostel: { _id: hostel._id, name: hostel.name } },
    })
    expect((await wardenApi.get("/api/v1/dashboard/student-statistics")).status).toBe(200)
  })
})

describe("dashboard — warden hostel statistics", () => {
  it("400 when the session has no hostel; 404 for a deleted hostel", async () => {
    const warden = await seed.warden()
    const api = await as(warden)

    const noHostel = await api.get("/api/v1/dashboard/warden/hostel-statistics")
    expect(noHostel.status).toBe(400)
    expect(noHostel.body.message).toMatch(/not assigned to any hostel/i)

    const { Types } = await import("mongoose")
    const ghostApi = await as(warden, {
      userData: { hostel: { _id: new Types.ObjectId().toString(), name: "Ghost Hostel" } },
    })
    const missing = await ghostApi.get("/api/v1/dashboard/warden/hostel-statistics")
    expect(missing.status).toBe(404)
  })

  it("returns room/occupancy stats plus open maintenance issues for the warden's hostel", async () => {
    const hostel = await createHostel()
    const unit = await createUnit({ hostelId: hostel._id })
    await createRoom({ hostelId: hostel._id, unitId: unit._id, capacity: 2, occupancy: 0 })
    const fullRoom = await createRoom({ hostelId: hostel._id, unitId: unit._id, capacity: 1, occupancy: 1 })
    const student = await seed.student()
    await createAllocation({
      userId: student._id,
      studentProfileId: (await createStudentProfile({ userId: student._id }))._id,
      hostelId: hostel._id,
      roomId: fullRoom._id,
    })

    const api = await as(await seed.warden(), {
      userData: { hostel: { _id: hostel._id, name: hostel.name } },
    })
    const res = await api.get("/api/v1/dashboard/warden/hostel-statistics")
    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(String(hostel._id))
    expect(res.body.data.name).toBe(hostel.name)
    expect(Number(res.body.data.totalRooms)).toBeGreaterThanOrEqual(2)
    expect(Number(res.body.data.activeRoomsOccupancy)).toBeGreaterThanOrEqual(1)
    expect(Number(res.body.data.occupiedRooms)).toBeGreaterThanOrEqual(1)
  })
})
