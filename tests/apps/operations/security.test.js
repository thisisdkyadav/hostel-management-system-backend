import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  initRealtime,
  patchSessionHostel,
  encryptQrExpiry,
  newAesKey,
  createHostel,
  createUnit,
  createRoom,
  createStudentProfile,
  createAllocation,
  createSecurityProfile,
  createCheckInOutEntry,
} from "../../helpers/seed/operations.js"

const BASE = "/api/v1/security"

let admin, studentPlain, maintenance, securityUser, gateApi, gateUser
let hostelA // room-only, the gate user's "own" hostel
let hostelB // unit-based, hosts the allocated students
let unitB1
let qrStudent // has aesKey + profile + allocation in hostelB (for verifyQR)

beforeAll(async () => {
  await setupTestDb()
  // getIO() (socket emit) and the online Redis client are only available after
  // Socket.IO boots; do it against a never-listening server.
  await initRealtime()

  admin = await seed.admin()
  studentPlain = await seed.student()
  maintenance = await seed.maintenanceStaff()
  securityUser = await seed.security()

  hostelA = await createHostel({ name: "Security Hostel A", type: "room-only" })
  hostelB = await createHostel({ name: "Security Hostel B", type: "unit-based" })
  unitB1 = await createUnit({ hostelId: hostelB._id, unitNumber: "U1", floor: 1 })

  // Security profile so GET /security resolves
  await createSecurityProfile({ userId: securityUser._id, hostelId: hostelA._id })

  // Gate user with a patched session hostel (session helper hardcodes null)
  gateUser = await seed.createUser({ role: "Hostel Gate" })
  gateApi = await as(gateUser)
  await patchSessionHostel(gateApi.cookie, hostelA)

  // Allocated student in Hostel B U1-101 bed 1 (for POST /entries happy path)
  const s1 = await seed.student({ name: "Allocated Student" })
  const p1 = await createStudentProfile({ userId: s1._id })
  await createAllocation({
    userId: s1._id,
    studentProfileId: p1._id,
    hostelId: hostelB._id,
    roomId: (await createRoom({ hostelId: hostelB._id, unitId: unitB1._id, roomNumber: "101", capacity: 2 }))._id,
    unitId: unitB1._id,
    bedNumber: 1,
  })

  // QR student: aesKey + profile + allocation in hostelB + one prior entry
  qrStudent = await seed.student({ name: "QR Student", aesKey: newAesKey() })
  const qp = await createStudentProfile({ userId: qrStudent._id })
  await createAllocation({
    userId: qrStudent._id,
    studentProfileId: qp._id,
    hostelId: hostelB._id,
    roomId: (await createRoom({ hostelId: hostelB._id, unitId: unitB1._id, roomNumber: "102", capacity: 1 }))._id,
    unitId: unitB1._id,
    bedNumber: 1,
  })
  await createCheckInOutEntry({
    userId: qrStudent._id,
    hostelId: hostelB._id,
    hostelName: hostelB.name,
    room: "102",
    unit: "U1",
    bed: "1",
    status: "Checked Out",
    isSameHostel: true,
  })

  // Entries for listing/scoping tests (mixed hostels/statuses)
  await createCheckInOutEntry({
    userId: s1._id,
    hostelId: hostelB._id,
    hostelName: hostelB.name,
    room: "101",
    unit: "U1",
    bed: "1",
    status: "Checked In",
    isSameHostel: true,
  })
  await createCheckInOutEntry({
    userId: studentPlain._id,
    hostelId: hostelA._id,
    hostelName: hostelA.name,
    room: "201",
    bed: "3",
    status: "Checked Out",
    isSameHostel: false,
    reason: "Market visit",
  })
})

afterAll(async () => {
  await teardownTestDb()
})

describe("GET /api/v1/security (current security profile)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
  })

  it("404 for authenticated users without a Security profile", async () => {
    const api = await as(studentPlain)
    const res = await api.get(BASE)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Security not found")
  })

  it("200 returns the caller's security profile with hostel info", async () => {
    const api = await as(securityUser)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.security).toBeDefined()
    expect(res.body.security._id).toBeDefined()
    // The Security model only stores userId + hostelId — name/email/phone are
    // read off the profile doc and therefore come back undefined.
    expect(res.body.security.email).toBeUndefined()
    expect(res.body.security.hostelName).toBe(hostelA.name)
    expect(res.body.security.hostelType).toBe(hostelA.type)
  })
})

describe("GET /api/v1/security/entries", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/entries`)
    expect(res.status).toBe(401)
  })

  it("403 for roles without a guard mapping (Maintenance Staff)", async () => {
    const api = await as(maintenance)
    const res = await api.get(`${BASE}/entries`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("200 for Student but scoped to their own entries only", async () => {
    const api = await as(studentPlain)
    const res = await api.get(`${BASE}/entries`)
    expect(res.status).toBe(200)
    expect(res.body.studentEntries).toHaveLength(1)
    expect(String(res.body.studentEntries[0].userId._id)).toBe(String(studentPlain._id))
    expect(res.body.meta.total).toBe(1)
  })

  it("200 for Admin with all entries, filters and pagination meta", async () => {
    const api = await as(admin)
    const all = await api.get(`${BASE}/entries`)
    expect(all.status).toBe(200)
    // 3 seeded at this point: s1 (B), studentPlain (A) + qrStudent's prior entry (B)
    expect(all.body.studentEntries).toHaveLength(3)
    expect(all.body.meta.total).toBe(3)
    expect(all.body.meta.totalPages).toBe(1)

    const byStatus = await api.get(`${BASE}/entries`).query({ status: "Checked Out" })
    // qrStudent's prior entry + studentPlain's 201 entry are both Checked Out
    expect(byStatus.body.studentEntries).toHaveLength(2)
    expect(byStatus.body.studentEntries.every((e) => e.status === "Checked Out")).toBe(true)

    const bySearch = await api.get(`${BASE}/entries`).query({ search: "201" })
    // search spans room/unit/bed plus name/email regexes, so assert the room
    // hit is present rather than an exact total.
    expect(bySearch.body.studentEntries.some((e) => e.room === "201")).toBe(true)

    const paged = await api.get(`${BASE}/entries`).query({ page: 2, limit: 1 })
    expect(paged.body.studentEntries).toHaveLength(1)
    expect(paged.body.meta.total).toBe(3)
  })
})

describe("GET /api/v1/security/entries/recent (Hostel Gate only)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/entries/recent`)
    expect(res.status).toBe(401)
  })

  it("403 for Admin (authorizeRoles Hostel Gate)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries/recent`)
    expect(res.status).toBe(403)
  })

  it("200 returns up to 10 recent entries newest-first for Hostel Gate", async () => {
    const res = await gateApi.get(`${BASE}/entries/recent`)
    expect(res.status).toBe(200)
    // Scoped to the gate user's session hostel (Hostel A) — only its entries.
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(1)
    expect(res.body.every((e) => e.hostelId.name === hostelA.name || e.hostelId === hostelA._id.toString())).toBe(true)
    const times = res.body.map((e) => new Date(e.dateAndTime).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })
})

describe("POST /api/v1/security/entries (Hostel Gate only)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/entries`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for Admin (Hostel Gate only)", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/entries`).send({})
    expect(res.status).toBe(403)
  })

  it("404 when the unit does not exist in the hostel", async () => {
    const res = await gateApi
      .post(`${BASE}/entries`)
      .send({ hostelId: String(hostelB._id), unit: "NOPE", room: "101", bed: "1", status: "Checked In" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Unit not found")
  })

  it("404 when the room does not exist in the unit", async () => {
    const res = await gateApi
      .post(`${BASE}/entries`)
      .send({ hostelId: String(hostelB._id), unit: "U1", room: "999", bed: "1", status: "Checked In" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Room not found")
  })

  it("404 when no allocation exists for the requested bed", async () => {
    const res = await gateApi
      .post(`${BASE}/entries`)
      .send({ hostelId: String(hostelB._id), unit: "U1", room: "101", bed: "9", status: "Checked In" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Room allocation not found")
  })

  it("201 even when the session user has no hostel (hostel name resolves from the target hostel)", async () => {
    const bareGate = await seed.createUser({ role: "Hostel Gate" })
    const api = await as(bareGate) // hostel stays null in the session
    const res = await api
      .post(`${BASE}/entries`)
      .send({ hostelId: String(hostelB._id), unit: "U1", room: "101", bed: "1", status: "Checked In" })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.studentEntry.hostelName).toBe(hostelB.name)
  })

  it("201 for a fully allocated student — hostelName now resolves from the hostel record", async () => {
    const res = await gateApi
      .post(`${BASE}/entries`)
      .send({
        hostelId: String(hostelB._id),
        unit: "U1",
        room: "101",
        bed: "1",
        status: "Checked In",
        reason: "Returned from leave",
      })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student entry added successfully")
    expect(res.body.studentEntry.hostelName).toBe(hostelB.name)
    // gateUser has no hostel in session, so the entry is flagged cross-hostel
    expect(res.body.studentEntry.isSameHostel).toBe(false)
  })
})

describe("POST /api/v1/security/entries/email (Hostel Gate only)", () => {
  let emailStudent

  beforeAll(async () => {
    emailStudent = await seed.student({ name: "Email Entry Student" })
    const p = await createStudentProfile({ userId: emailStudent._id })
    await createAllocation({
      userId: emailStudent._id,
      studentProfileId: p._id,
      hostelId: hostelB._id,
      roomId: (await createRoom({ hostelId: hostelB._id, unitId: unitB1._id, roomNumber: "103", capacity: 1 }))._id,
      unitId: unitB1._id,
      bedNumber: 1,
    })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/entries/email`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/entries/email`).send({ email: emailStudent.email })
    expect(res.status).toBe(403)
  })

  it("404 when no user has the email", async () => {
    const res = await gateApi.post(`${BASE}/entries/email`).send({ email: "ghost@hms.test", status: "Checked In" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("User not found")
  })

  it("404 when the user has no room allocation (clean not-found, no crash)", async () => {
    const res = await gateApi
      .post(`${BASE}/entries/email`)
      .send({ email: studentPlain.email, status: "Checked In" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/not allocated to any room/i)
  })

  it("201 creates an entry from the student's current allocation", async () => {
    const res = await gateApi
      .post(`${BASE}/entries/email`)
      .send({ email: emailStudent.email.toUpperCase(), status: "Checked Out", reason: "Gate log" })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student entry added successfully")
    expect(res.body.studentEntry.room).toBe("103")
    expect(res.body.studentEntry.unit).toBe("U1")
    expect(res.body.studentEntry.status).toBe("Checked Out")
    // email lookup is case-insensitive (queried above with uppercase)
  })
})

describe("PUT /api/v1/security/entries/:entryId (Hostel Gate only)", () => {
  let entry

  beforeAll(async () => {
    entry = await createCheckInOutEntry({
      userId: studentPlain._id,
      hostelId: hostelA._id,
      hostelName: hostelA.name,
      room: "301",
      bed: "1",
      status: "Checked In",
      isSameHostel: true,
    })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/entries/${entry._id}`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/entries/${entry._id}`).send({})
    expect(res.status).toBe(403)
  })

  it("400 for a malformed entry id (CastError)", async () => {
    const res = await gateApi.put(`${BASE}/entries/not-an-id`).send({ status: "Checked Out" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("404 for an unknown but well-formed id", async () => {
    const res = await gateApi.put(`${BASE}/entries/${new mongoose.Types.ObjectId()}`).send({ status: "Checked Out" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Entry not found")
  })

  it("200 updates room/bed/status/timestamp of the entry", async () => {
    const res = await gateApi.put(`${BASE}/entries/${entry._id}`).send({
      unit: "U9",
      room: "305",
      bed: "2",
      status: "Checked Out",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student entry updated successfully")
    expect(res.body.studentEntry.room).toBe("305")
    expect(res.body.studentEntry.unit).toBe("U9")
    expect(res.body.studentEntry.bed).toBe("2")
    expect(res.body.studentEntry.status).toBe("Checked Out")
    expect(res.body.studentEntry.dateAndTime).toBeDefined()
  })
})

describe("PATCH /api/v1/security/entries/:entryId/cross-hostel-reason (Hostel Gate only)", () => {
  let entry

  beforeAll(async () => {
    entry = await createCheckInOutEntry({
      userId: studentPlain._id,
      hostelId: hostelA._id,
      hostelName: hostelA.name,
      room: "401",
      bed: "1",
      status: "Checked In",
      isSameHostel: false,
    })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.patch(`${BASE}/entries/${entry._id}/cross-hostel-reason`).send({ reason: "x" })
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(maintenance)
    const res = await api.patch(`${BASE}/entries/${entry._id}/cross-hostel-reason`).send({ reason: "x" })
    expect(res.status).toBe(403)
  })

  it("404 for unknown id", async () => {
    const res = await gateApi
      .patch(`${BASE}/entries/${new mongoose.Types.ObjectId()}/cross-hostel-reason`)
      .send({ reason: "x" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Entry not found")
  })

  it("200 records the cross-hostel reason", async () => {
    const res = await gateApi
      .patch(`${BASE}/entries/${entry._id}/cross-hostel-reason`)
      .send({ reason: "Visiting friend in another hostel" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.studentEntry.reason).toBe("Visiting friend in another hostel")
  })
})

describe("DELETE /api/v1/security/entries/:entryId (Hostel Gate only)", () => {
  let entry

  beforeAll(async () => {
    entry = await createCheckInOutEntry({
      userId: studentPlain._id,
      hostelId: hostelA._id,
      hostelName: hostelA.name,
      room: "501",
      bed: "1",
      status: "Checked In",
      isSameHostel: true,
    })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.delete(`${BASE}/entries/${entry._id}`)
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.delete(`${BASE}/entries/${entry._id}`)
    expect(res.status).toBe(403)
  })

  it("200 deletes the entry, then 404 on repeat", async () => {
    const res = await gateApi.delete(`${BASE}/entries/${entry._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student entry deleted successfully")

    const again = await gateApi.delete(`${BASE}/entries/${entry._id}`)
    expect(again.status).toBe(404)
    expect(again.body.message).toBe("Entry not found")

    // Gone from the listing too
    const list = await as(admin)
    const resList = await list.get(`${BASE}/entries`).query({ search: "501" })
    expect(resList.body.studentEntries).toHaveLength(0)
  })
})

describe("POST /api/v1/security/verify-qr (Hostel Gate only)", () => {
  const validPayload = async (user, expiryMs = Date.now() + 60_000) => ({
    email: user.email,
    encryptedData: encryptQrExpiry(user.aesKey, expiryMs),
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/verify-qr`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/verify-qr`).send({})
    expect(res.status).toBe(403)
  })

  it("400 when email or encryptedData are missing", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({ email: qrStudent.email })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Invalid QR Code")
  })

  it("400 when the email is unknown", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: "nobody@hms.test", encryptedData: "aa:bb" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Invalid QR Code")
  })

  it("400 'Invalid QR Code' with undecryptable data (decrypt failures no longer 500)", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: qrStudent.email, encryptedData: "garbage-no-colon" })
    expect(res.status).toBe(400)
    // this controller emits failures as { error: message }
    expect(res.body.error).toBe('Invalid QR Code')
  })

  it("400 when the QR payload is expired", async () => {
    const payload = await validPayload(qrStudent, Date.now() - 60_000)
    const res = await gateApi.post(`${BASE}/verify-qr`).send(payload)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("QR Code Expired")
  })

  it("404 when the user has no student profile", async () => {
    const staffWithQr = await seed.student({ aesKey: newAesKey() }) // no profile
    const payload = await validPayload(staffWithQr)
    const res = await gateApi.post(`${BASE}/verify-qr`).send(payload)
    expect(res.status).toBe(404)
    expect(res.body.error).toBe("Student not found")
  })

  it("200 verifies a valid QR and flags same-hostel status + last entry", async () => {
    const payload = await validPayload(qrStudent)
    const res = await gateApi.post(`${BASE}/verify-qr`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.studentProfile.rollNumber).toBeDefined()
    expect(res.body.studentProfile.email).toBe(qrStudent.email)
    // profile allocation is in hostelB, gate session hostel is hostelA
    expect(res.body.studentProfile.isSameHostel).toBe(false)
    expect(res.body.lastCheckInOut).toBeDefined()
    expect(res.body.lastCheckInOut.status).toBe("Checked Out")
  })
})

describe("GET /api/v1/security/entries/face-scanner (Hostel Gate only)", () => {
  beforeAll(async () => {
    // One pending cross-hostel check-in without a reason
    await createCheckInOutEntry({
      userId: studentPlain._id,
      hostelId: hostelA._id,
      hostelName: hostelA.name,
      room: "601",
      bed: "1",
      status: "Checked In",
      isSameHostel: false,
    })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/entries/face-scanner`)
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/entries/face-scanner`)
    expect(res.status).toBe(403)
  })

  it("200 lists entries with pagination and pending cross-hostel queue", async () => {
    const res = await gateApi.get(`${BASE}/entries/face-scanner`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.entries)).toBe(true)
    expect(res.body.entries.length).toBeGreaterThanOrEqual(1)
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(1)

    const pending = res.body.pendingCrossHostelEntries
    expect(pending.length).toBeGreaterThanOrEqual(1)
    expect(pending.every((e) => e.isSameHostel === false && !e.reason && e.status === "Checked In")).toBe(true)
  })

  it("filters by status", async () => {
    const res = await gateApi.get(`${BASE}/entries/face-scanner`).query({ status: "Checked Out" })
    expect(res.status).toBe(200)
    expect(res.body.entries.every((e) => e.status === "Checked Out")).toBe(true)
  })
})
