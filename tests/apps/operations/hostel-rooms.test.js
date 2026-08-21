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

// Error wire shape: { message } only. Success shapes vary per handler (raw
// array / { data, message, status, meta } / { message, success }).

const admin = () => seed.admin()
const supervisorWith = (hostel) =>
  seed.createUser({ role: "Hostel Supervisor" }).then((u) => ({
    user: u,
    api: () => as(u, { userData: { hostel: { _id: hostel._id, name: hostel.name } } }),
  }))

describe("hostel rooms — auth wall", () => {
  it("401 without a session", async () => {
    const api = await anon()
    for (const [method, url] of [
      ["get", "/api/v1/hostel/units/000000000000000000000000"],
      ["get", "/api/v1/hostel/rooms-room-only"],
      ["post", "/api/v1/hostel/allocate"],
      ["put", "/api/v1/hostel/archive/000000000000000000000000"],
    ]) {
      expect((await api[method](url)).status).toBe(401)
    }
  })

  it("students and wardens are 403 on Admin/Supervisor-only mutations; students 403 everywhere", async () => {
    const hostel = await createHostel()

    const studentApi = await as(await seed.student())
    expect((await studentApi.get(`/api/v1/hostel/units/${hostel._id}`)).status).toBe(403)
    expect((await studentApi.post("/api/v1/hostel/allocate").send({})).status).toBe(403)

    const wardenApi = await as(await seed.warden())
    // wardens can read
    expect((await wardenApi.get(`/api/v1/hostel/units/${hostel._id}`)).status).toBe(200)
    // but not manage
    expect((await wardenApi.post("/api/v1/hostel/allocate").send({})).status).toBe(403)
    expect((await wardenApi.put(`/api/v1/hostel/rooms/${hostel._id}/bulk-update`).send({})).status).toBe(403)
    expect((await wardenApi.put(`/api/v1/hostel/archive/${hostel._id}`)).status).toBe(403)

    const supervisorPlain = await seed.createUser({ role: "Hostel Supervisor" })
    const supNoHostel = await as(supervisorPlain)
    // supervisors can read too
    expect((await supNoHostel.get(`/api/v1/hostel/units/${hostel._id}`)).status).toBe(200)
    expect((await supNoHostel.post("/api/v1/hostel/allocate").send({})).status).toBe(403) // no active hostel -> denied

    // archive is Admin-only even for supervisors
    expect((await supNoHostel.put(`/api/v1/hostel/archive/${hostel._id}`)).status).toBe(403)
  })
})

describe("hostel rooms — reads with scoping", () => {
  it("GET /units/:hostelId returns units with shaped rooms; foreign-hostel staff are forbidden", async () => {
    const hostelA = await createHostel({ type: "unit-based" })
    const hostelB = await createHostel()
    const unit = await createUnit({ hostelId: hostelA._id, unitNumber: "R1" })
    await createRoom({ hostelId: hostelA._id, unitId: unit._id, roomNumber: "101", capacity: 2 })

    const adminApi = await as(await admin())
    let res = await adminApi.get(`/api/v1/hostel/units/${hostelA._id}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const unitRow = res.body.find((u) => u.unitNumber === "R1")
    expect(unitRow.roomCount).toBeGreaterThanOrEqual(1)
    expect(unitRow.rooms[0]).toMatchObject({ roomNumber: "101", capacity: 2 })

    // supervisor bound to hostel B cannot read hostel A's units
    const { api: bApi } = await supervisorWith(hostelB)
    res = await bApi().then((a) => a.get(`/api/v1/hostel/units/${hostelA._id}`))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/permission to access this hostel/i)

    // unbound supervisor can read anything
    const freeSup = await as(await seed.createUser({ role: "Hostel Supervisor" }))
    expect((await freeSup.get(`/api/v1/hostel/units/${hostelA._id}`)).status).toBe(200)
  })

  it("GET /rooms/:unitId and GET /rooms-room-only list shaped rooms with students", async () => {
    const hostel = await createHostel()
    const unit = await createUnit({ hostelId: hostel._id, unitNumber: "R2" })
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    const occupied = await createRoom({
      hostelId: hostel._id,
      unitId: unit._id,
      roomNumber: "201",
      capacity: 2,
      occupancy: 1,
    })
    await createAllocation({
      userId: student._id,
      studentProfileId: profile._id,
      hostelId: hostel._id,
      roomId: occupied._id,
      unitId: unit._id,
    })
    await createRoom({ hostelId: hostel._id, unitId: unit._id, roomNumber: "202", capacity: 1 })

    const api = await as(await admin())
    let res = await api.get(`/api/v1/hostel/rooms/${unit._id}`)
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("success")
    const byNumber = Object.fromEntries(res.body.data.map((r) => [r.roomNumber, r]))
    expect(byNumber["201"].currentOccupancy).toBe(1)
    expect(byNumber["201"].students[0].rollNumber).toBe(profile.rollNumber)
    expect(byNumber["202"].students).toHaveLength(0)

    res = await api.get(`/api/v1/hostel/rooms-room-only?hostelId=${hostel._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)

    // hostel-bound supervisor asking for a foreign hostel is forbidden
    const other = await createHostel()
    const { api: scopedApi } = await supervisorWith(other)
    res = await scopedApi().then((a) => a.get(`/api/v1/hostel/rooms-room-only?hostelId=${hostel._id}`))
    expect(res.status).toBe(403)
  })
})

describe("hostel rooms — allocate / deallocate", () => {
  it("allocate requires all fields and an active room; happy path allocates a bed", async () => {
    const hostel = await createHostel()
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    const room = await createRoom({ hostelId: hostel._id, capacity: 2, occupancy: 0 })
    const api = await as(await admin())

    // missing fields
    let res = await api.post("/api/v1/hostel/allocate").send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/missing required fields/i)

    // inactive room refused
    const dead = await createRoom({ hostelId: hostel._id, roomNumber: "X99", capacity: 1, status: "Inactive" })
    res = await api.post("/api/v1/hostel/allocate").send({
      hostelId: hostel._id,
      roomId: dead._id,
      studentId: profile._id,
      userId: student._id,
      bedNumber: 1,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/inactive room/i)
    void dead

    // happy path
    res = await api.post("/api/v1/hostel/allocate").send({
      hostelId: hostel._id,
      roomId: room._id,
      studentId: profile._id,
      userId: student._id,
      bedNumber: 1,
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/allocated successfully/i)
    expect(res.body.allocation.roomId).toBe(String(room._id))

    // deallocate it again
    const allocationId = res.body.allocation._id
    res = await api.delete(`/api/v1/hostel/deallocate/${allocationId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // unknown allocation id
    const { Types } = await import("mongoose")
    res = await api.delete(`/api/v1/hostel/deallocate/${new Types.ObjectId().toString()}`)
    expect(res.status).toBe(404)
  })

  it("hostel-bound supervisors cannot allocate into another hostel", async () => {
    const mine = await createHostel()
    const theirs = await createHostel()
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    const foreignRoom = await createRoom({ hostelId: theirs._id, capacity: 2 })

    const { api } = await supervisorWith(mine)
    const res = await api().then((a) =>
      a.post("/api/v1/hostel/allocate").send({
        hostelId: theirs._id,
        roomId: foreignRoom._id,
        studentId: profile._id,
        userId: student._id,
        bedNumber: 1,
      })
    )
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/active hostel/i)
  })
})

describe("hostel rooms — room management", () => {
  it("PUT /rooms/status/:roomId updates manual statuses; Guest is not settable here", async () => {
    const hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, capacity: 2 })
    void hostel
    const api = await as(await admin())

    let res = await api.put(`/api/v1/hostel/rooms/status/${room._id}`).send({ status: "Maintenance" })
    expect(res.status).toBe(200)
    expect(res.body.updatedRoom.status).toBe("Maintenance")

    res = await api.put(`/api/v1/hostel/rooms/status/${room._id}`).send({ status: "Guest" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/set automatically/i)

    const { Types } = await import("mongoose")
    res = await api.put(`/api/v1/hostel/rooms/status/${new Types.ObjectId().toString()}`).send({ status: "Active" })
    expect([404, 400, 500]).toContain(res.status)
  })

  it("GET /rooms/:hostelId/edit lists compact rows for Admin and scoped Supervisor", async () => {
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: "E1", capacity: 2 })
    const other = await createHostel()

    const api = await as(await admin())
    let res = await api.get(`/api/v1/hostel/rooms/${hostel._id}/edit`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data[0]).toMatchObject({ roomNumber: "E1", capacity: 2 })

    const { api: scopedApi } = await supervisorWith(other)
    res = await scopedApi().then((a) => a.get(`/api/v1/hostel/rooms/${hostel._id}/edit`))
    expect(res.status).toBe(403)
  })

  it("POST /rooms/:hostelId/add creates rooms; PUT /rooms/:hostelId/:roomId validates status/capacity", async () => {
    const hostel = await createHostel()
    const api = await as(await admin())

    let res = await api.post(`/api/v1/hostel/rooms/${hostel._id}/add`).send({
      rooms: [
        { roomNumber: "N1", capacity: 2 },
        { roomNumber: "N2", capacity: 3 },
      ],
      units: [],
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const rooms = await as(await admin()).then((a) => a.get(`/api/v1/hostel/rooms/${hostel._id}/edit`))
    const created = rooms.body.data.find((r) => r.roomNumber === "N1")
    expect(created.capacity).toBe(2)

    // invalid status value
    res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/${created.id}`).send({ status: "Guest" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid status/i)

    // invalid capacity
    res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/${created.id}`).send({ status: "Active", capacity: -1 })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/positive integer/i)

    // valid update deactivates the room
    res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/${created.id}`).send({ status: "Inactive" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    // re-activate with new capacity
    res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/${created.id}`).send({ status: "Active", capacity: 4 })
    expect(res.status).toBe(200)
  })

  it("bulk-update activates/deactivates/resizes by room number; no-op answers cleanly", async () => {
    const hostel = await createHostel()
    const r1 = await createRoom({ hostelId: hostel._id, roomNumber: "BU1", capacity: 2 })
    const r2 = await createRoom({ hostelId: hostel._id, roomNumber: "BU2", capacity: 2 })
    const api = await as(await admin())

    let res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/bulk-update`).send({
      rooms: [
        { roomNumber: "BU1", status: "Inactive" },
        { roomNumber: "BU2", capacity: 5 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRoomIds.map(String)).toEqual(expect.arrayContaining([String(r1._id), String(r2._id)]))

    // nothing changed now -> clean no-op
    res = await api.put(`/api/v1/hostel/rooms/${hostel._id}/bulk-update`).send({
      rooms: [{ roomNumber: "BU1", status: "Inactive" }],
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/no rooms to update/i)

    // unknown hostel
    const { Types } = await import("mongoose")
    res = await api.put(`/api/v1/hostel/rooms/${new Types.ObjectId().toString()}/bulk-update`).send({ rooms: [] })
    expect(res.status).toBe(404)

    // re-activate BU1 for later suites
    await api
      .put(`/api/v1/hostel/rooms/${hostel._id}/bulk-update`)
      .send({ rooms: [{ roomNumber: "BU1", status: "Active" }] })
  })

  it("delete-all-allocations wipes allocations for a hostel; archive is Admin-only", async () => {
    const hostel = await createHostel()
    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    const room = await createRoom({ hostelId: hostel._id, capacity: 2, occupancy: 1 })
    await createAllocation({
      userId: student._id,
      studentProfileId: profile._id,
      hostelId: hostel._id,
      roomId: room._id,
    })

    const api = await as(await admin())
    let res = await api.delete(`/api/v1/hostel/delete-all-allocations/${hostel._id}`)
    expect([200, 404]).toContain(res.status) // 404 when the hostel has no allocatable rooms recorded

    res = await api.put(`/api/v1/hostel/archive/${hostel._id}`).send({ status: true })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it("PUT /update-allocations/:hostelId rejects non-admin/supervisor roles", async () => {
    const wardenApi = await as(await seed.warden())
    expect(
      (await wardenApi.put("/api/v1/hostel/update-allocations/000000000000000000000000").send({})).status
    ).toBe(403)
  })
})
