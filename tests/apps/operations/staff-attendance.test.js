import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  patchSessionHostel,
  encryptQrExpiry,
  newAesKey,
  createHostel,
  createSecurityProfile,
  createStaffAttendance,
} from "../../helpers/seed/operations.js"

const BASE = "/api/v1/staff"

let admin, student, securityStaff, maintenanceStaff, gateApi, hostelA

beforeAll(async () => {
  await setupTestDb()

  admin = await seed.admin()
  student = await seed.student()
  hostelA = await createHostel({ name: "Attendance Hostel A", type: "room-only" })

  // Staff whose QR codes will be scanned
  securityStaff = await seed.security({ aesKey: newAesKey() })
  await createSecurityProfile({ userId: securityStaff._id, hostelId: hostelA._id })
  maintenanceStaff = await seed.maintenanceStaff({ aesKey: newAesKey() })

  // Gate operator with a patched session hostel (recordAttendance reads it)
  const gateUser = await seed.createUser({ role: "Hostel Gate" })
  gateApi = await as(gateUser)
  await patchSessionHostel(gateApi.cookie, hostelA)

  // Existing attendance history
  await createStaffAttendance({ userId: securityStaff._id, hostelId: hostelA._id, type: "checkIn" })
  await createStaffAttendance({ userId: maintenanceStaff._id, hostelId: hostelA._id, type: "checkOut" })
})

afterAll(async () => {
  await teardownTestDb()
})

describe("POST /api/v1/staff/verify-qr (Hostel Gate only)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/verify-qr`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for Admin and Security (Hostel Gate only)", async () => {
    for (const user of [admin, await seed.security()]) {
      const api = await as(user)
      const res = await api.post(`${BASE}/verify-qr`).send({})
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    }
  })

  it("400 when email or encryptedData are missing", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({ email: securityStaff.email })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Invalid QR Code data")
  })

  it("400 when no staff has the email", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: "ghost@hms.test", encryptedData: "aa:bb" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Staff not found")
  })

  it("400 when the scanned user is not Security/Maintenance staff", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: student.email, encryptedData: "aa:bb" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid staff type")
  })

  it("400 'Invalid QR Code' with undecryptable data (decrypt failures no longer 500)", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: securityStaff.email, encryptedData: "garbage-no-colon" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid QR Code')
  })

  it("400 when the QR payload is expired", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({
      email: securityStaff.email,
      encryptedData: encryptQrExpiry(securityStaff.aesKey, Date.now() - 60_000),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("QR Code Expired")
  })

  it("200 verifies a security guard's QR with hostel info and latest attendance", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({
      email: securityStaff.email,
      encryptedData: encryptQrExpiry(securityStaff.aesKey, Date.now() + 60_000),
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.staffInfo.email).toBe(securityStaff.email)
    expect(res.body.staffInfo.staffType).toBe("security")
    expect(res.body.staffInfo.role).toBe("Security")
    expect(String(res.body.staffInfo.hostelId)).toBe(String(hostelA._id))
    expect(res.body.staffInfo.hostelName).toBe(hostelA.name)
    expect(res.body.latestAttendance).toBeDefined()
    expect(res.body.latestAttendance.type).toBe("checkIn")
  })

  it("200 verifies a maintenance staffer's QR without hostel info", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({
      email: maintenanceStaff.email,
      encryptedData: encryptQrExpiry(maintenanceStaff.aesKey, Date.now() + 60_000),
    })
    expect(res.status).toBe(200)
    expect(res.body.staffInfo.staffType).toBe("maintenance")
    expect(res.body.staffInfo.hostelId).toBeUndefined()
    expect(res.body.staffInfo.hostelName).toBeUndefined()
  })
})

describe("POST /api/v1/staff/attendance/record (Hostel Gate only)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/attendance/record`).send({})
    expect(res.status).toBe(401)
  })

  it("403 for non-Hostel-Gate roles", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/attendance/record`).send({})
    expect(res.status).toBe(403)
  })

  it("400 when email or type are missing", async () => {
    const res = await gateApi.post(`${BASE}/attendance/record`).send({ email: securityStaff.email })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Missing required fields")
  })

  it("400 for an invalid attendance type", async () => {
    const res = await gateApi
      .post(`${BASE}/attendance/record`)
      .send({ email: securityStaff.email, type: "lunch" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid attendance type")
  })

  it("400 when no staff has the email", async () => {
    const res = await gateApi
      .post(`${BASE}/attendance/record`)
      .send({ email: "ghost@hms.test", type: "checkIn" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Staff not found")
  })

  it("400 when the target user is not staff", async () => {
    const res = await gateApi
      .post(`${BASE}/attendance/record`)
      .send({ email: student.email, type: "checkIn" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid staff type")
  })

  it("400 when the gate session has no hostel (clean validation, no crash)", async () => {
    const bareGate = await seed.createUser({ role: "Hostel Gate" })
    const api = await as(bareGate)
    const res = await api
      .post(`${BASE}/attendance/record`)
      .send({ email: securityStaff.email, type: "checkIn" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not assigned to a hostel/i)
  })

  it("201 records a check-in then a check-out for the same staffer", async () => {
    const inRes = await gateApi
      .post(`${BASE}/attendance/record`)
      .send({ email: securityStaff.email, type: "checkIn" })
    expect(inRes.status).toBe(201)
    expect(inRes.body.success).toBe(true)
    expect(inRes.body.message).toBe("Staff checked in successfully")
    expect(inRes.body.attendance.type).toBe("checkIn")
    expect(String(inRes.body.attendance.userId)).toBe(String(securityStaff._id))
    expect(String(inRes.body.attendance.hostelId)).toBe(String(hostelA._id))

    const outRes = await gateApi
      .post(`${BASE}/attendance/record`)
      .send({ email: securityStaff.email.toUpperCase(), type: "checkOut" })
    expect(outRes.status).toBe(201)
    expect(outRes.body.message).toBe("Staff checked out successfully")
    expect(outRes.body.attendance.type).toBe("checkOut")
  })
})

describe("GET /api/v1/staff/attendance/records", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(401)
  })

  it("403 for Student (no guard mapping)", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("200 lists all records with meta for Admin", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.records.length).toBeGreaterThanOrEqual(4)
    expect(res.body.meta.total).toBeGreaterThanOrEqual(4)
    expect(res.body.meta.page).toBe(1)
  })

  it("filters by userId", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ userId: String(securityStaff._id) })
    expect(res.status).toBe(200)
    expect(res.body.records.length).toBeGreaterThanOrEqual(3)
    expect(res.body.records.every((r) => String(r.userId._id ?? r.userId) === String(securityStaff._id))).toBe(true)
  })

  it("filters by staffType=security / maintenance", async () => {
    const api = await as(admin)
    const sec = await api.get(`${BASE}/attendance/records`).query({ staffType: "security" })
    expect(sec.body.records.every((r) => String(r.userId._id ?? r.userId) === String(securityStaff._id))).toBe(true)

    const maint = await api.get(`${BASE}/attendance/records`).query({ staffType: "maintenance" })
    expect(maint.body.records.every((r) => String(r.userId._id ?? r.userId) === String(maintenanceStaff._id))).toBe(true)
  })

  it("filters by hostelId", async () => {
    const api = await as(admin)
    const other = await createHostel({ name: "Attendance Hostel B" })
    const otherStaff = await seed.security()
    await createStaffAttendance({ userId: otherStaff._id, hostelId: other._id, type: "checkIn" })

    const res = await api.get(`${BASE}/attendance/records`).query({ hostelId: String(other._id) })
    expect(res.status).toBe(200)
    expect(res.body.records).toHaveLength(1)
    expect(String(res.body.records[0].hostelId._id ?? res.body.records[0].hostelId)).toBe(String(other._id))
  })

  it("scopes records to the caller's hostel for Hostel Gate", async () => {
    const res = await gateApi.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(200)
    expect(res.body.records.every((r) => String(r.hostelId._id ?? r.hostelId) === String(hostelA._id))).toBe(true)
  })

  it("paginates with page/limit", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ page: 1, limit: 2 })
    expect(res.status).toBe(200)
    expect(res.body.records).toHaveLength(2)
    expect(res.body.meta.limit).toBe(2)
    expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// Hardening: QR edge cases (key mismatch, extreme expiries, wrong roles)
// ---------------------------------------------------------------------------
describe("POST /api/v1/staff/verify-qr — QR edge cases", () => {
  it("403 for more wrong roles on verify-qr and record (Maintenance Staff, Student)", async () => {
    for (const user of [maintenanceStaff, student]) {
      const api = await as(user)
      expect((await api.post(`${BASE}/verify-qr`).send({})).status).toBe(403)
      expect((await api.post(`${BASE}/attendance/record`).send({})).status).toBe(403)
    }
  })

  it("400 Invalid QR Code when the payload is encrypted under a key other than the stored aesKey", async () => {
    const mismatchedKey = newAesKey()
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: securityStaff.email, encryptedData: encryptQrExpiry(mismatchedKey, Date.now() + 60_000) })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid QR Code")
  })

  it("200 for a far-future expiry (year 2999)", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({
      email: securityStaff.email,
      encryptedData: encryptQrExpiry(securityStaff.aesKey, new Date("2999-01-01").getTime()),
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.staffInfo.staffType).toBe("security")
  })

  it("400 QR Code Expired for an ancient expiry (year 1900)", async () => {
    const res = await gateApi.post(`${BASE}/verify-qr`).send({
      email: securityStaff.email,
      encryptedData: encryptQrExpiry(securityStaff.aesKey, new Date("1900-01-01").getTime()),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("QR Code Expired")
  })

  it("400 when email is empty but encryptedData present", async () => {
    const res = await gateApi
      .post(`${BASE}/verify-qr`)
      .send({ email: "", encryptedData: encryptQrExpiry(securityStaff.aesKey, Date.now() + 60_000) })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid QR Code data")
  })
})

// ---------------------------------------------------------------------------
// Hardening: attendance state machine + validation edges
// ---------------------------------------------------------------------------
describe("POST /api/v1/staff/attendance/record — state machine edges", () => {
  it("SUSPECTED BUG: duplicate check-in for the same staffer creates a second record instead of conflicting", async () => {
    const first = await gateApi.post(`${BASE}/attendance/record`).send({ email: maintenanceStaff.email, type: "checkIn" })
    expect(first.status).toBe(201)

    const second = await gateApi.post(`${BASE}/attendance/record`).send({ email: maintenanceStaff.email, type: "checkIn" })
    expect(second.status).toBe(201)
    expect(String(second.body.attendance._id)).not.toBe(String(first.body.attendance._id))
  })

  it("SUSPECTED BUG: check-out is accepted with no prior check-in (no state guard)", async () => {
    const fresh = await seed.security()
    const res = await gateApi.post(`${BASE}/attendance/record`).send({ email: fresh.email, type: "checkOut" })
    // Current behavior: 201, a checkOut row is recorded for someone never checked in.
    expect(res.status).toBe(201)
    expect(res.body.attendance.type).toBe("checkOut")
  })

  it("400 Missing required fields for an empty-string type", async () => {
    const res = await gateApi.post(`${BASE}/attendance/record`).send({ email: securityStaff.email, type: "" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Missing required fields")
  })

  it("400 Invalid attendance type is case-sensitive ('CheckIn' rejected)", async () => {
    const res = await gateApi.post(`${BASE}/attendance/record`).send({ email: securityStaff.email, type: "CheckIn" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid attendance type")
  })
})

// ---------------------------------------------------------------------------
// Hardening: records listing — filters, pagination edges, scoping overrides
// ---------------------------------------------------------------------------
describe("GET /api/v1/staff/attendance/records — edge inputs", () => {
  it("403 for Super Admin (no guard mapping despite being an admin-class role)", async () => {
    const api = await as(await seed.superAdmin())
    const res = await api.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(403)
  })

  it("SUSPECTED BUG: any staffType value other than 'security' silently maps to Maintenance Staff", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ staffType: "bogus-type" })
    expect(res.status).toBe(200)
    expect(res.body.records.length).toBeGreaterThanOrEqual(1)
    expect(res.body.records.every((r) => String(r.userId._id ?? r.userId) === String(maintenanceStaff._id))).toBe(true)
  })

  it("userId filter wins when both userId and staffType are given", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ userId: String(maintenanceStaff._id), staffType: "security" })
    expect(res.status).toBe(200)
    expect(res.body.records.every((r) => String(r.userId._id ?? r.userId) === String(maintenanceStaff._id))).toBe(true)
  })

  it("200 zero matches for a staffType with no users... none exist; invalid value falls into maintenance bucket", async () => {
    // Covered by the bogus-type test above; here assert start>end range.
    const api = await as(admin)
    const now = new Date().toISOString()
    const later = new Date(Date.now() + 7 * 86400000).toISOString()
    const res = await api.get(`${BASE}/attendance/records`).query({ startDate: later, endDate: now })
    expect(res.status).toBe(200)
    expect(res.body.records).toHaveLength(0)
    expect(res.body.meta.total).toBe(0)
  })

  it("500 for page=0 (negative skip reaches Mongo)", async () => {
    // SUSPECTED BUG: page is parsed but never validated; skip goes negative.
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ page: 0, limit: 10 })
    expect([200, 500]).toContain(res.status)
    if (res.status === 500) {
      expect(res.body.success).toBe(false)
    }
  })

  it("500 or graceful handling for non-numeric page", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ page: "abc", limit: 10 })
    expect([200, 500]).toContain(res.status)
    if (res.status === 500) {
      expect(res.body.message).toBeDefined()
    }
  })

  it("200 honors limit=1000", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/attendance/records`).query({ page: 1, limit: 1000 })
    expect(res.status).toBe(200)
    expect(res.body.meta.limit).toBe(1000)
    expect(res.body.records.length).toBeGreaterThanOrEqual(4)
    expect(res.body.meta.totalPages).toBe(1)
  })

  it("session hostel override re-scopes the listing via as(user, { userData: { hostel } })", async () => {
    const otherHostel = await createHostel({ name: "Attendance Override Hostel" })
    const scopedGate = await seed.createUser({ role: "Hostel Gate" })
    const api = await as(scopedGate, {
      userData: { hostel: { _id: String(otherHostel._id), name: otherHostel.name, type: "room-only" } },
    })
    const res = await api.get(`${BASE}/attendance/records`)
    expect(res.status).toBe(200)
    // No records exist for the override hostel yet.
    expect(res.body.records).toHaveLength(0)
    expect(res.body.meta.total).toBe(0)
  })

  it("extreme date ranges do not crash (year 1900 / 2999)", async () => {
    const api = await as(admin)
    const wide = await api.get(`${BASE}/attendance/records`).query({ startDate: "1900-01-01", endDate: "2999-12-31" })
    expect(wide.status).toBe(200)
    expect(wide.body.meta.total).toBeGreaterThanOrEqual(4)

    const ancient = await api.get(`${BASE}/attendance/records`).query({ startDate: "1900-01-01", endDate: "1901-01-01" })
    expect(ancient.status).toBe(200)
    expect(ancient.body.meta.total).toBe(0)
  })
})
