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

  it("500 when required fields are missing // SUSPECTED BUG: should be a 400/422 validation error, but the service swallows the Mongoose ValidationError and maps every creation failure to 500", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.post(BASE).send({})
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Error creating leave")
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

  it("500 for a malformed id // SUSPECTED BUG: the service try/catch converts the Mongoose CastError into a generic 500 instead of a 400 invalid-id response", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/not-an-id/approve`).send({ approvalInfo: "ok" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Error approving leave")
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
