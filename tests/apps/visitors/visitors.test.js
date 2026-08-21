import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createHostel,
  createUnit,
  createRoom,
} from "../../helpers/seed/operations.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---- fixtures --------------------------------------------------------------

const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

const requestPayload = () => ({
  reason: "Parents visiting for convocation",
  fromDate: day(3).toISOString(),
  toDate: day(5).toISOString(),
})

/** Create a visitor profile through the API (also exercises POST /profiles). */
async function apiVisitorProfile(studentApi) {
  const res = await studentApi.post("/api/v1/visitor/profiles").send({
    name: "Sunita Devi",
    phone: "9876500000",
    email: "sunita@example.com",
    relation: "Mother",
    address: "12 Civil Lines",
  })
  expect(res.status).toBe(201)
  return res.body.visitorProfile
}

async function seedRequest(student, overrides = {}) {
  const { VisitorProfile, VisitorRequest } = await import("../../../src/models/index.js")
  const profile = await VisitorProfile.create({
    studentUserId: student._id,
    name: "Seeded Visitor",
    phone: "9000000000",
    email: "seeded@example.com",
    relation: "Father",
  })
  return VisitorRequest.create({
    userId: student._id,
    visitors: [profile._id],
    reason: "Seeded visit",
    fromDate: day(2),
    toDate: day(4),
    ...overrides,
  })
}

// ---------------------------------------------------------------------------

describe("visitor requests — auth wall", () => {
  it("all routes 401 without a session", async () => {
    const api = await anon()
    const routes = [
      ["get", "/api/v1/visitor/requests/summary"],
      ["get", "/api/v1/visitor/requests/student/000000000000000000000000"],
      ["get", "/api/v1/visitor/requests/000000000000000000000000"],
      ["post", "/api/v1/visitor/requests"],
      ["put", "/api/v1/visitor/requests/000000000000000000000000"],
      ["delete", "/api/v1/visitor/requests/000000000000000000000000"],
      ["get", "/api/v1/visitor/profiles"],
      ["post", "/api/v1/visitor/profiles"],
      ["post", "/api/v1/visitor/requests/000000000000000000000000/approve"],
      ["put", "/api/v1/visitor/requests/000000000000000000000000/payment-info"],
    ]
    for (const [method, url] of routes) {
      expect((await api[method](url)).status).toBe(401)
    }
  })

  it("students are 403 on staff-only routes; staff are 403 on student-only routes", async () => {
    const student = await seed.student()
    const warden = await seed.warden()
    const gate = await seed.createUser({ role: "Hostel Gate" })

    const studentApi = await as(student)
    const wardenApi = await as(warden)
    const gateApi = await as(gate)

    // student-only
    expect((await wardenApi.post("/api/v1/visitor/requests").send(requestPayload())).status).toBe(403)
    expect((await wardenApi.get("/api/v1/visitor/profiles")).status).toBe(403)
    expect((await gateApi.post("/api/v1/visitor/profiles").send({})).status).toBe(403)

    // staff-only
    expect((await studentApi.get("/api/v1/visitor/requests/student/000000000000000000000000")).status).toBe(403)
    expect((await studentApi.post("/api/v1/visitor/requests/000000000000000000000000/allocate").send({})).status).toBe(403)
    expect((await wardenApi.post("/api/v1/visitor/requests/000000000000000000000000/checkin").send({})).status).toBe(403)

    // admin-only action route
    expect((await wardenApi.post("/api/v1/visitor/requests/000000000000000000000000/approve").send({})).status).toBe(403)
  })
})

describe("visitor profiles (student)", () => {
  it("create -> list -> update round-trip", async () => {
    const student = await seed.student()
    const api = await as(student)

    const created = await apiVisitorProfile(api)
    expect(created.name).toBe("Sunita Devi")
    expect(created.studentUserId).toBe(String(student._id))

    const list = await api.get("/api/v1/visitor/profiles")
    expect(list.status).toBe(200)
    // NOTE: this controller emits the raw service data — nested envelope quirk
    expect(list.body.success).toBe(true)
    const profiles = list.body.data?.data ?? list.body.data
    expect(profiles.map((p) => String(p._id))).toContain(String(created._id))

    const updated = await api.put(`/api/v1/visitor/profiles/${created._id}`).send({ phone: "9111111111" })
    expect(updated.status).toBe(200)
    expect(updated.body.visitorProfile.phone).toBe("9111111111")
  })

  it("profile validation: missing required fields are rejected by the model", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.post("/api/v1/visitor/profiles").send({ name: "No Contact Info" })
    expect(res.status).toBe(422) // global handler maps model ValidationError to 422
  })

  it("a profile with linked requests cannot be updated or deleted (guard)", async () => {
    const student = await seed.student()
    const api = await as(student)
    const profile = await apiVisitorProfile(api)
    await seedRequest(student, {}) // links nothing yet — link it explicitly below

    const { VisitorProfile, VisitorRequest } = await import("../../../src/models/index.js")
    const prof = await VisitorProfile.findById(profile._id)
    const req = await VisitorRequest.create({
      userId: student._id,
      visitors: [prof._id],
      reason: "linked",
      fromDate: day(1),
      toDate: day(2),
    })
    void req

    const upd = await api.put(`/api/v1/visitor/profiles/${profile._id}`).send({ phone: "8000000000" })
    expect(upd.status).toBe(500)
    expect(upd.body.message).toMatch(/failed to update/i)

    const del = await api.delete(`/api/v1/visitor/profiles/${profile._id}`)
    expect(del.status).toBe(500)
    expect(del.body.message).toMatch(/failed to delete/i)
  })

  it("a clean profile deletes fine and unknown ids 404", async () => {
    const student = await seed.student()
    const api = await as(student)
    const profile = await apiVisitorProfile(api)

    const del = await api.delete(`/api/v1/visitor/profiles/${profile._id}`)
    expect(del.status).toBe(200)
    expect(del.body.success).toBe(true)

    const { Types } = await import("mongoose")
    const missing = await api.delete(`/api/v1/visitor/profiles/${new Types.ObjectId().toString()}`)
    expect(missing.status).toBe(404)
  })

  it("rejects updates/deletes of another student's visitor profile (ownership enforced)", async () => {
    const owner = await seed.student()
    const attacker = await seed.student()
    const ownerApi = await as(owner)
    const profile = await apiVisitorProfile(ownerApi)

    const attackerApi = await as(attacker)
    const upd = await attackerApi.put(`/api/v1/visitor/profiles/${profile._id}`).send({ name: "Hacked" })
    expect(upd.status).toBe(403)
    expect(upd.body.message).toMatch(/your own visitor profiles/i)

    const del = await attackerApi.delete(`/api/v1/visitor/profiles/${profile._id}`)
    expect(del.status).toBe(403)

    // the owner is unaffected
    const ok = await ownerApi.put(`/api/v1/visitor/profiles/${profile._id}`).send({ name: "Still Mine" })
    expect(ok.status).toBe(200)
  })
})

describe("visitor requests (student lifecycle)", () => {
  it("create returns 201 with the request payload echoed", async () => {
    const student = await seed.student()
    const api = await as(student)

    const res = await api.post("/api/v1/visitor/requests").send(requestPayload())
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/submitted successfully/i)
    expect(res.body.visitorRequest.userId).toBe(String(student._id))
    expect(res.body.visitorRequest.status).toBe("Pending")
  })

  it("summary lists only the student's own requests with pagination metadata", async () => {
    const mine = await seed.student()
    const theirs = await seed.student()
    await seedRequest(mine)
    await seedRequest(theirs)

    const api = await as(mine)
    const res = await api.get("/api/v1/visitor/requests/summary")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.pagination).toMatchObject({ page: 1 })
    for (const r of res.body.data) {
      expect(String(r.userId?._id ?? r.userId)).toBe(String(mine._id))
    }
  })

  it("summary supports status filter and allocation filter", async () => {
    const student = await seed.student()
    await seedRequest(student, { status: "Approved" })
    await seedRequest(student, { status: "Pending" })

    const api = await as(student)
    let res = await api.get("/api/v1/visitor/requests/summary?status=approved")
    expect(res.body.data.every((r) => r.status === "Approved")).toBe(true)

    res = await api.get("/api/v1/visitor/requests/summary?allocation=unallocated")
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)

    res = await api.get("/api/v1/visitor/requests/summary?allocation=allocated")
    expect(res.body.data.length).toBe(0)
  })

  it("GET by id serves full details to the owning student's request (any authenticated allowed role)", async () => {
    const student = await seed.student()
    const request = await seedRequest(student)
    const api = await as(student)

    const res = await api.get(`/api/v1/visitor/requests/${request._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data._id).toBe(String(request._id))
    expect(res.body.data.visitorCount).toBe(1)
    expect(res.body.data.visitorNames).toBe("Seeded Visitor")
    expect(res.body.data.isAllocated).toBe(false)
  })

  it("GET by id 404s for unknown ids", async () => {
    const student = await seed.student()
    const api = await as(student)
    const { Types } = await import("mongoose")
    const res = await api.get(`/api/v1/visitor/requests/${new Types.ObjectId().toString()}`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it("update works only while pending", async () => {
    const student = await seed.student()
    const pending = await seedRequest(student)
    const approved = await seedRequest(student, { status: "Approved" })
    const api = await as(student)

    let res = await api.put(`/api/v1/visitor/requests/${pending._id}`).send({
      reason: "Updated reason",
      fromDate: day(4).toISOString(),
      toDate: day(6).toISOString(),
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRequest.reason).toBe("Updated reason")

    res = await api.put(`/api/v1/visitor/requests/${approved._id}`).send({ reason: "nope" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not pending/i)
  })

  it("delete works only while pending (model guard), unknown ids 404", async () => {
    const student = await seed.student()
    const pending = await seedRequest(student)
    const approved = await seedRequest(student, { status: "Approved" })
    const api = await as(student)

    let res = await api.delete(`/api/v1/visitor/requests/${approved._id}`)
    expect(res.status).toBe(500)
    expect(res.body.message).toMatch(/failed to delete/i)

    res = await api.delete(`/api/v1/visitor/requests/${pending._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const { Types } = await import("mongoose")
    res = await api.delete(`/api/v1/visitor/requests/${new Types.ObjectId().toString()}`)
    expect(res.status).toBe(404)
  })

  it("payment-info is owner-only and persists the payment details", async () => {
    const owner = await seed.student()
    const other = await seed.student()
    const request = await seedRequest(owner)
    const ownerApi = await as(owner)
    const otherApi = await as(other)

    const forbiddenRes = await otherApi.put(`/api/v1/visitor/requests/${request._id}/payment-info`).send({
      amount: 100,
    })
    expect(forbiddenRes.status).toBe(403)
    expect(forbiddenRes.body.message).toMatch(/not authorized/i)

    const res = await ownerApi.put(`/api/v1/visitor/requests/${request._id}/payment-info`).send({
      amount: 500,
      dateOfPayment: new Date().toISOString(),
      transactionId: "UTR123456789",
      additionalInfo: "paid via UPI",
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRequest.paymentInfo.amount).toBe(500)
    expect(res.body.updatedRequest.paymentInfo.transactionId).toBe("UTR123456789")

    const { Types } = await import("mongoose")
    const missing = await ownerApi
      .put(`/api/v1/visitor/requests/${new Types.ObjectId().toString()}/payment-info`)
      .send({ amount: 1 })
    expect(missing.status).toBe(404)
  })
})

describe("visitor requests — staff operations", () => {
  it("GET /requests/student/:userId lists that student's requests for staff", async () => {
    const student = await seed.student()
    const warden = await seed.warden()
    await seedRequest(student)
    await seedRequest(student)

    const api = await as(warden)
    const res = await api.get(`/api/v1/visitor/requests/student/${student._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(2)
    expect(res.body.data[0].visitorCount).toBe(1)
  })

  it("admin approve/reject updates status and stores hostel/rejection data", async () => {
    const student = await seed.student()
    const admin = await seed.admin()
    const hostel = await createHostel()
    const toApprove = await seedRequest(student)
    const toReject = await seedRequest(student)
    const api = await as(admin)

    let res = await api.post(`/api/v1/visitor/requests/${toApprove._id}/approve`).send({
      hostelId: hostel._id,
      approvalInformation: "Approved at front office",
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRequest.status).toBe("Approved")
    expect(res.body.updatedRequest.hostelId).toBe(String(hostel._id))
    expect(res.body.updatedRequest.approveInfo).toBe("Approved at front office")

    res = await api.post(`/api/v1/visitor/requests/${toReject._id}/reject`).send({
      reason: "No rooms available",
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRequest.status).toBe("Rejected")
    expect(res.body.updatedRequest.reasonForRejection).toBe("No rooms available")

    // invalid action value -> 400
    res = await api.post(`/api/v1/visitor/requests/${toApprove._id}/postpone`).send({})
    expect(res.status).toBe(400)

    // unknown id -> 404
    const { Types } = await import("mongoose")
    res = await api.post(`/api/v1/visitor/requests/${new Types.ObjectId().toString()}/approve`).send({})
    expect(res.status).toBe(404)
  })

  it("room allocation requires the staff member's hostel, valid empty rooms, and succeeds transactionally", async () => {
    const student = await seed.student()
    const supervisor = await seed.createUser({ role: "Hostel Supervisor" })
    const hostel = await createHostel()
    const unit = await createUnit({ hostelId: hostel._id, unitNumber: "V1" })
    const freeRoom = await createRoom({ hostelId: hostel._id, unitId: unit._id, roomNumber: "G-101", capacity: 2 })
    const occupiedRoom = await createRoom({
      hostelId: hostel._id,
      unitId: unit._id,
      roomNumber: "G-102",
      capacity: 2,
      occupancy: 1,
    })
    const request = await seedRequest(student)

    // session must carry the staff hostel (normally derived from the staff profile)
    const api = await as(supervisor, {
      userData: { hostel: { _id: hostel._id, name: hostel.name } },
    })

    // occupied room refused
    let res = await api.post(`/api/v1/visitor/requests/${request._id}/allocate`).send({
      allocationData: [["G-102"]],
    })
    expect(res.status).toBe(500) // thrown inside the transaction -> error envelope
    expect(res.body.success).toBe(false)

    // unknown room refused
    res = await api.post(`/api/v1/visitor/requests/${request._id}/allocate`).send({
      allocationData: [["NOPE"]],
    })
    expect(res.status).toBe(500)

    // happy path
    res = await api.post(`/api/v1/visitor/requests/${request._id}/allocate`).send({
      allocationData: [["G-101", "V1"]],
    })
    expect(res.status).toBe(200)
    expect(res.body.updatedRequest.allocatedRooms.map(String)).toContain(String(freeRoom._id))

    // reflected in the detail view
    const detail = await as(student).then((s) => s.get(`/api/v1/visitor/requests/${request._id}`))
    expect(detail.body.data.isAllocated).toBe(true)
    void occupiedRoom
  })

  it("check-in / check-out / time correction (Hostel Gate)", async () => {
    const student = await seed.student()
    const gate = await seed.createUser({ role: "Hostel Gate" })
    const request = await seedRequest(student)
    const api = await as(gate)

    const now = new Date().toISOString()

    let res = await api.post(`/api/v1/visitor/requests/${request._id}/checkin`).send({
      checkInTime: now,
      notes: "Arrived with two bags",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/check-in successful/i)
    expect(new Date(res.body.updatedRequest.checkInTime).toISOString()).toBe(now)
    expect(res.body.updatedRequest.securityNotes).toBe("Arrived with two bags")

    res = await api.post(`/api/v1/visitor/requests/${request._id}/checkout`).send({
      checkOutTime: now,
      notes: "Left happily",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/check-out successful/i)
    expect(res.body.updatedRequest.checkOutTime).toBeTruthy()

    res = await api.put(`/api/v1/visitor/requests/${request._id}/update-check-times`).send({
      checkInTime: now,
      checkOutTime: now,
      notes: "corrected times",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/updated successfully/i)

    const { Types } = await import("mongoose")
    res = await api.post(`/api/v1/visitor/requests/${new Types.ObjectId().toString()}/checkin`).send({})
    expect(res.status).toBe(404)
  })
})
