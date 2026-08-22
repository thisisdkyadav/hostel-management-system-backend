import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

const BASE = "/api/v1/leave"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("POST /api/v1/leave (create leave)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(BASE).send({ reason: "x", startDate: new Date(), endDate: new Date() })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for Student (role gate)", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.post(BASE).send({ reason: "x", startDate: new Date(), endDate: new Date() })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("403 for Warden (not in allowed roles)", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.post(BASE).send({ reason: "x", startDate: new Date(), endDate: new Date() })
    expect(res.status).toBe(403)
  })

  it("422 with field errors when required fields are missing (ValidationError reaches the global handler)", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.post(BASE).send({})
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("201 creates a Pending leave for Admin and returns { leave }", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const start = new Date()
    const end = new Date(Date.now() + 5 * 86400000)
    const res = await api.post(BASE).send({ reason: "Family function", startDate: start, endDate: end })
    expect(res.status).toBe(201)
    // Controller emits result.data only ({ leave }) — no success envelope.
    expect(res.body.leave).toBeDefined()
    expect(res.body.leave.reason).toBe("Family function")
    expect(res.body.leave.status).toBe("Pending")
    expect(res.body.leave.joinStatus).toBe("Not Joined")
    expect(String(res.body.leave.userId)).toBe(String(admin._id))
  })

  it("201 works for Hostel Supervisor and Maintenance Staff", async () => {
    const supervisor = await seed.hostelSupervisor()
    const maintenance = await seed.maintenanceStaff()
    const api1 = await as(supervisor)
    const res1 = await api1.post(BASE).send({ reason: "Trip", startDate: new Date(), endDate: new Date() })
    expect(res1.status).toBe(201)
    expect(String(res1.body.leave.userId)).toBe(String(supervisor._id))

    const api2 = await as(maintenance)
    const res2 = await api2.post(BASE).send({ reason: "Medical", startDate: new Date(), endDate: new Date() })
    expect(res2.status).toBe(201)
    expect(String(res2.body.leave.userId)).toBe(String(maintenance._id))
  })
})

describe("GET /api/v1/leave/my-leaves", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/my-leaves`)
    expect(res.status).toBe(401)
  })

  it("403 for Student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/my-leaves`)
    expect(res.status).toBe(403)
  })

  it("returns only the caller's leaves, newest first", async () => {
    const staff = await seed.maintenanceStaff()
    const other = await seed.maintenanceStaff()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    await createLeave({ userId: staff._id, reason: "First" })
    await new Promise((r) => setTimeout(r, 250))
    await createLeave({ userId: staff._id, reason: "Second" })
    await createLeave({ userId: other._id, reason: "Someone else" })

    const api = await as(staff)
    const res = await api.get(`${BASE}/my-leaves`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.leaves)).toBe(true)
    expect(res.body.leaves).toHaveLength(2)
    expect(res.body.leaves[0].reason).toBe("Second")
    expect(res.body.leaves.every((l) => String(l.userId) === String(staff._id))).toBe(true)
  })
})

describe("GET /api/v1/leave/all (admin only)", () => {
  let admin, supervisor

  beforeAll(async () => {
    admin = await seed.admin()
    supervisor = await seed.hostelSupervisor()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    await createLeave({ userId: supervisor._id, reason: "L1", status: "Pending" })
    await createLeave({ userId: supervisor._id, reason: "L2", status: "Approved" })
    await createLeave({ userId: admin._id, reason: "L3", status: "Rejected" })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(401)
  })

  it("403 for non-Admin roles (Hostel Supervisor)", async () => {
    const api = await as(supervisor)
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  // NOTE: other describes in this file also create leaves (the file shares one
  // dropped-per-file database), so global counts are asserted via a
  // fresh-user filter instead of absolute totals.
  it("200 returns paginated leaves with metadata and populated requester", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(supervisor._id), limit: 10, page: 1 })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(2)
    expect(res.body.totalPages).toBe(1)
    expect(res.body.currentPage).toBe(1)
    expect(res.body.limit).toBe(10)
    // requester populated with name/email
    expect(res.body.leaves[0].userId.name).toBeDefined()
    expect(res.body.leaves[0].userId.email).toBeDefined()
  })

  it("200 filters by status", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ status: "Approved" })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBeGreaterThanOrEqual(1)
    expect(res.body.leaves.every((l) => l.status === "Approved")).toBe(true)
  })

  it("200 filters by userId", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(supervisor._id) })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(2)
    expect(res.body.leaves.every((l) => String(l.userId._id ?? l.userId) === String(supervisor._id))).toBe(true)
  })

  it("200 paginates to the second page", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(supervisor._id), limit: 1, page: 2 })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(2)
    expect(res.body.totalPages).toBe(2)
    expect(res.body.currentPage).toBe(2)
    expect(res.body.leaves).toHaveLength(1)
  })
})

describe("PUT /api/v1/leave/:id/approve (admin only)", () => {
  let admin, supervisor, leave

  beforeAll(async () => {
    admin = await seed.admin()
    supervisor = await seed.hostelSupervisor()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    leave = await createLeave({ userId: supervisor._id, reason: "To approve" })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${leave._id}/approve`).send({ approvalInfo: "ok" })
    expect(res.status).toBe(401)
  })

  it("403 for non-Admin roles", async () => {
    const api = await as(supervisor)
    const res = await api.put(`${BASE}/${leave._id}/approve`).send({ approvalInfo: "ok" })
    expect(res.status).toBe(403)
  })

  it("404 for an unknown but well-formed id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/approve`).send({ approvalInfo: "ok" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Leave not found")
    expect(res.body.success).toBe(false)
  })

  it("400 Invalid ID format for a malformed id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/not-an-id/approve`).send({ approvalInfo: "ok" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("200 approves the leave and records approver + approval date", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${leave._id}/approve`).send({ approvalInfo: "Approved by office" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.leave.status).toBe("Approved")
    expect(res.body.leave.approvalInfo).toBe("Approved by office")
    expect(String(res.body.leave.approvalBy)).toBe(String(admin._id))
    expect(res.body.leave.approvalDate).toBeDefined()
  })
})

describe("PUT /api/v1/leave/:id/reject (admin only)", () => {
  let admin, staff, leave

  beforeAll(async () => {
    admin = await seed.admin()
    staff = await seed.maintenanceStaff()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    leave = await createLeave({ userId: staff._id, reason: "To reject" })
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${leave._id}/reject`).send({ reasonForRejection: "no" })
    expect(res.status).toBe(401)
  })

  it("403 for non-Admin roles", async () => {
    const api = await as(staff)
    const res = await api.put(`${BASE}/${leave._id}/reject`).send({ reasonForRejection: "no" })
    expect(res.status).toBe(403)
  })

  it("404 for unknown id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/reject`).send({ reasonForRejection: "no" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Leave not found")
  })

  it("200 rejects the leave with a rejection reason", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${leave._id}/reject`).send({ reasonForRejection: "Staffing shortage" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.leave.status).toBe("Rejected")
    expect(res.body.leave.reasonForRejection).toBe("Staffing shortage")
    expect(String(res.body.leave.approvalBy)).toBe(String(admin._id))
  })
})

describe("PUT /api/v1/leave/:id/join (admin only) + full workflow", () => {
  let admin, staff

  beforeAll(async () => {
    admin = await seed.admin()
    staff = await seed.hostelSupervisor()
  })

  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/join`).send({ joinInfo: "back" })
    expect(res.status).toBe(401)
  })

  it("403 for non-Admin roles", async () => {
    const api = await as(staff)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/join`).send({ joinInfo: "back" })
    expect(res.status).toBe(403)
  })

  it("404 for unknown id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${new mongoose.Types.ObjectId()}/join`).send({ joinInfo: "back" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Leave not found")
  })

  it("full workflow: staff creates -> admin approves -> staff joins -> visible via my-leaves", async () => {
    const staffApi = await as(staff)
    const adminApi = await as(admin)

    const created = await staffApi
      .post(BASE)
      .send({ reason: "Workflow leave", startDate: new Date(), endDate: new Date(Date.now() + 86400000) })
    expect(created.status).toBe(201)
    const leaveId = created.body.leave._id

    // Before approval it is Pending / Not Joined
    const mineBefore = await staffApi.get(`${BASE}/my-leaves`)
    const before = mineBefore.body.leaves.find((l) => l._id === leaveId)
    expect(before.status).toBe("Pending")
    expect(before.joinStatus).toBe("Not Joined")

    const approved = await adminApi.put(`${BASE}/${leaveId}/approve`).send({ approvalInfo: "ok" })
    expect(approved.status).toBe(200)
    expect(approved.body.leave.status).toBe("Approved")

    const joined = await adminApi.put(`${BASE}/${leaveId}/join`).send({ joinInfo: "Joined on time" })
    expect(joined.status).toBe(200)
    expect(joined.body.success).toBe(true)
    expect(joined.body.leave.joinStatus).toBe("Joined")
    expect(joined.body.leave.joinInfo).toBe("Joined on time")
    expect(joined.body.leave.joinDate).toBeDefined()

    const mineAfter = await staffApi.get(`${BASE}/my-leaves`)
    const after = mineAfter.body.leaves.find((l) => l._id === leaveId)
    expect(after.status).toBe("Approved")
    expect(after.joinStatus).toBe("Joined")
  })
})

// ---------------------------------------------------------------------------
// Hardening: validation edges on create
// ---------------------------------------------------------------------------
describe("POST /api/v1/leave — validation edges", () => {
  let admin

  beforeAll(async () => {
    admin = await seed.admin()
  })

  const validPayload = () => ({
    reason: "Edge case",
    startDate: new Date(),
    endDate: new Date(Date.now() + 86400000),
  })

  it.each(["reason", "startDate", "endDate"])("422 when %s is missing (one at a time)", async (field) => {
    const payload = validPayload()
    delete payload[field]
    const api = await as(admin)
    const res = await api.post(BASE).send(payload)
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Validation failed")
    expect(res.body.errors.some((e) => e.field === field)).toBe(true)
  })

  it("422 when reason is an empty string", async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send({ ...validPayload(), reason: "" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("422 Validation failed when startDate is an unparseable string", async () => {
    // On document save, Mongoose aggregates the date cast failure into a
    // ValidationError, so this reaches the 422 handler (not the CastError 400).
    const api = await as(admin)
    const res = await api.post(BASE).send({ ...validPayload(), startDate: "not-a-date" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Validation failed")
  })

  it("201 accepts date-only strings for startDate/endDate", async () => {
    const api = await as(admin)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    const res = await api.post(BASE).send({ reason: "Date-only", startDate: tomorrow, endDate: tomorrow })
    expect(res.status).toBe(201)
    expect(new Date(res.body.leave.startDate).toISOString().slice(0, 10)).toBe(tomorrow)
  })

  it("201 accepts extreme dates (year 1900 start, year 2999 end)", async () => {
    const api = await as(admin)
    const res = await api
      .post(BASE)
      .send({ reason: "Time traveler", startDate: new Date("1900-01-01T00:00:00.000Z"), endDate: new Date("2999-12-31T23:59:59.000Z") })
    expect(res.status).toBe(201)
    expect(new Date(res.body.leave.startDate).getUTCFullYear()).toBe(1900)
    expect(new Date(res.body.leave.endDate).getUTCFullYear()).toBe(2999)
  })
})

// ---------------------------------------------------------------------------
// Hardening: cross-family denials (roles outside the leave module entirely)
// ---------------------------------------------------------------------------
describe("leave routes — cross-family role denials", () => {
  it("403 for Security and Hostel Gate on POST /", async () => {
    for (const user of [await seed.security(), await seed.createUser({ role: "Hostel Gate" })]) {
      const api = await as(user)
      const res = await api.post(BASE).send({ reason: "x", startDate: new Date(), endDate: new Date() })
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    }
  })

  it("403 for Security on GET /my-leaves", async () => {
    const api = await as(await seed.security())
    const res = await api.get(`${BASE}/my-leaves`)
    expect(res.status).toBe(403)
  })

  it("403 for Security and Hostel Gate on admin-only routes (/all, approve)", async () => {
    const { createLeave } = await import("../../helpers/seed/operations.js")
    const staff = await seed.maintenanceStaff()
    const leave = await createLeave({ userId: staff._id, reason: "Denial target" })
    for (const user of [await seed.security(), await seed.createUser({ role: "Hostel Gate" })]) {
      const api = await as(user)
      expect((await api.get(`${BASE}/all`)).status).toBe(403)
      expect((await api.put(`${BASE}/${leave._id}/approve`).send({ approvalInfo: "x" })).status).toBe(403)
      expect((await api.put(`${BASE}/${leave._id}/reject`).send({ reasonForRejection: "x" })).status).toBe(403)
      expect((await api.put(`${BASE}/${leave._id}/join`).send({ joinInfo: "x" })).status).toBe(403)
    }
  })
})

// ---------------------------------------------------------------------------
// Hardening: state-machine edges (no transitions are guarded server-side)
// ---------------------------------------------------------------------------
describe("PUT /api/v1/leave/:id/approve|reject|join — state machine edges", () => {
  let admin
  let rejectThenApprove, approveThenReject, pendingJoin, joinedAgain

  beforeAll(async () => {
    admin = await seed.admin()
    const staff = await seed.hostelSupervisor()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    rejectThenApprove = await createLeave({ userId: staff._id, reason: "Reject then approve", status: "Rejected" })
    approveThenReject = await createLeave({ userId: staff._id, reason: "Approve then reject", status: "Approved" })
    pendingJoin = await createLeave({ userId: staff._id, reason: "Join while pending" })
    joinedAgain = await createLeave({ userId: staff._id, reason: "Join twice", status: "Approved", joinStatus: undefined })
  })

  it("SUSPECTED BUG: approving an already-Rejected leave succeeds — no state guard", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${rejectThenApprove._id}/approve`).send({ approvalInfo: "flip" })
    // Current behavior: 200, status flips Rejected -> Approved.
    expect(res.status).toBe(200)
    expect(res.body.leave.status).toBe("Approved")
  })

  it("SUSPECTED BUG: rejecting an already-Approved leave succeeds — no state guard", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${approveThenReject._id}/reject`).send({ reasonForRejection: "changed mind" })
    expect(res.status).toBe(200)
    expect(res.body.leave.status).toBe("Rejected")
  })

  it("SUSPECTED BUG: joining a still-Pending leave succeeds without approval", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${pendingJoin._id}/join`).send({ joinInfo: "never approved" })
    expect(res.status).toBe(200)
    expect(res.body.leave.joinStatus).toBe("Joined")
    expect(res.body.leave.status).toBe("Pending")
  })

  it("SUSPECTED BUG: joining twice overwrites joinInfo/joinDate instead of conflicting", async () => {
    const api = await as(admin)
    const first = await api.put(`${BASE}/${joinedAgain._id}/join`).send({ joinInfo: "first join" })
    expect(first.status).toBe(200)
    const second = await api.put(`${BASE}/${joinedAgain._id}/join`).send({ joinInfo: "second join" })
    expect(second.status).toBe(200)
    expect(second.body.leave.joinInfo).toBe("second join")
  })

  it("400 Invalid ID format for malformed ids on reject and join", async () => {
    const api = await as(admin)
    const rej = await api.put(`${BASE}/bogus/reject`).send({ reasonForRejection: "x" })
    expect(rej.status).toBe(400)
    expect(rej.body.message).toBe("Invalid ID format")

    const join = await api.put(`${BASE}/bogus/join`).send({ joinInfo: "x" })
    expect(join.status).toBe(400)
    expect(join.body.message).toBe("Invalid ID format")
  })

  it("approve/reject succeed even when their body fields are missing (optional fields)", async () => {
    // approvalInfo / reasonForRejection are not required by the schema.
    const staff = await seed.maintenanceStaff()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    const a = await createLeave({ userId: staff._id, reason: "No info approve" })
    const r = await createLeave({ userId: staff._id, reason: "No reason reject" })
    const api = await as(admin)
    const resA = await api.put(`${BASE}/${a._id}/approve`).send({})
    expect(resA.status).toBe(200)
    const resR = await api.put(`${BASE}/${r._id}/reject`).send({})
    expect(resR.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Hardening: GET /all pagination + filter edges
// ---------------------------------------------------------------------------
describe("GET /api/v1/leave/all — pagination/filter edges", () => {
  let admin, owner

  beforeAll(async () => {
    admin = await seed.admin()
    owner = await seed.warden()
    const { createLeave } = await import("../../helpers/seed/operations.js")
    await createLeave({ userId: owner._id, reason: "Edge A", status: "Pending" })
    await createLeave({ userId: owner._id, reason: "Edge B", status: "Approved" })
  })

  it("200 totalCount 0 for a status value outside the enum (filter is passed through verbatim)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ status: "Bogus" })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(0)
    expect(res.body.leaves).toHaveLength(0)
    expect(res.body.totalPages).toBe(0)
  })

  it("400 Invalid ID format for a malformed userId filter (CastError)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: "not-an-id" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("500 Error getting leaves for page=0 (negative skip reaches Mongo)", async () => {
    // SUSPECTED BUG: page=0 is not validated; skip becomes negative and Mongo
    // rejects it, surfacing as a 500 from the service fallback.
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(owner._id), page: 0 })
    expect(res.status).toBe(500)
    expect(res.body.success).toBeUndefined()
    expect(res.body.message).toBe("Error getting leaves")
  })

  it("SUSPECTED BUG: non-numeric page returns 200 with currentPage null (NaN skip silently tolerated)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(owner._id), page: "abc" })
    // Current behavior: parseInt('abc') = NaN reaches the query, Mongo treats
    // it as no-skip, and currentPage serializes as null instead of erroring.
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.leaves)).toBe(true)
    expect(res.body.currentPage).toBeNull()
  })

  it("200 returns an empty page beyond totalPages while totals stay correct", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(owner._id), limit: 2, page: 99 })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(2)
    expect(res.body.currentPage).toBe(99)
    expect(res.body.leaves).toHaveLength(0)
  })

  it("200 honors limit=1000 in one page", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`).query({ userId: String(owner._id), limit: 1000, page: 1 })
    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(1000)
    expect(res.body.totalCount).toBe(2)
    expect(res.body.leaves).toHaveLength(2)
  })

  it("200 start>end createdAt range matches nothing", async () => {
    const api = await as(admin)
    const now = new Date().toISOString()
    const later = new Date(Date.now() + 7 * 86400000).toISOString()
    const res = await api.get(`${BASE}/all`).query({ startDate: later, endDate: now })
    expect(res.status).toBe(200)
    expect(res.body.totalCount).toBe(0)
    expect(res.body.leaves).toHaveLength(0)
  })

  it("200 filters by extreme date ranges without crashing (year 1900 / 2999)", async () => {
    const api = await as(admin)
    const wide = await api.get(`${BASE}/all`).query({ startDate: "1900-01-01", endDate: "2999-12-31" })
    expect(wide.status).toBe(200)
    expect(wide.body.totalCount).toBeGreaterThanOrEqual(2)

    const ancient = await api.get(`${BASE}/all`).query({ endDate: "1900-12-31" })
    expect(ancient.status).toBe(200)
    expect(ancient.body.totalCount).toBe(0)
  })
})
