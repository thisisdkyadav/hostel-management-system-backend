import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import complaintsFixtures from "../../helpers/seed/complaints.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// This module uses the `handler()` adapter -> strict envelope
// { success, message, data, errors }. Complaint creation returns 200 (not 201).
const BASE = "/api/v1/complaint"

describe("POST /complaint (create)", () => {
  let studentWithAllocation
  let admin
  let security

  beforeAll(async () => {
    studentWithAllocation = await complaintsFixtures.studentWithRoom(seed)
    admin = await seed.admin()
    security = await seed.security()
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(BASE).send({ title: "x", description: "y" })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for roles outside the route guard (Security)", async () => {
    const api = await as(security)
    const res = await api.post(BASE).send({ title: "x", description: "y" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Access denied|do not have access/)
  })

  it("404 for a Student with no room allocation", async () => {
    const homeless = await seed.student()
    const api = await as(homeless)
    const res = await api.post(BASE).send({
      userId: String(homeless._id),
      title: "No room complaint",
      description: "I still want to complain",
      category: "Other",
    })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Room allocation not found")
  })

  it("resolves the allocation from the authenticated student when body omits userId", async () => {
    // Students no longer need to echo their own id — ownership and the
    // allocation both come from the session user.
    const { user } = studentWithAllocation
    const api = await as(user)
    const res = await api.post(BASE).send({ title: "No userId", description: "d" })
    expect(res.status).toBe(200)
    expect(String(res.body.data.userId)).toBe(String(user._id))
  })

  it("creates a complaint for a student and stamps hostel/unit/room from the allocation", async () => {
    const { user, hostel, unit, room } = studentWithAllocation
    const api = await as(user)
    const res = await api.post(BASE).send({
      userId: String(user._id),
      title: "Leaky tap",
      description: "The tap has not stopped dripping for days",
      category: "Plumbing",
      location: "Washroom corridor",
      attachments: ["media://photo/1.jpg"],
    })
    // The service uses success() (not created()) so this is a 200.
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const complaint = res.body.data
    expect(complaint.title).toBe("Leaky tap")
    expect(complaint.status).toBe("Pending")
    expect(complaint.category).toBe("Plumbing")
    expect(String(complaint.userId)).toBe(String(user._id))
    expect(String(complaint.hostelId)).toBe(String(hostel._id))
    expect(String(complaint.unitId)).toBe(String(unit._id))
    expect(String(complaint.roomId)).toBe(String(room._id))
    expect(complaint.attachments).toEqual(["media://photo/1.jpg"])
  })

  it("defaults category to Other when omitted", async () => {
    const { user } = studentWithAllocation
    const api = await as(user)
    const res = await api.post(BASE).send({ userId: String(user._id), title: "Misc", description: "misc" })
    expect(res.status).toBe(200)
    expect(res.body.data.category).toBe("Other")
  })

  it("lets an Admin file a complaint on behalf of a userId (no hostel attached)", async () => {
    const target = await seed.student()
    const api = await as(admin)
    const res = await api.post(BASE).send({
      userId: String(target._id),
      title: "Filed by admin",
      description: "Admin filed this on the student's behalf",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(String(res.body.data.userId)).toBe(String(target._id))
    expect(res.body.data.hostelId ?? null).toBeNull()
  })

  it("ignores body.userId for students — allocation and ownership follow the caller", async () => {
    // A student can no longer attribute a complaint to another user: the
    // allocation (and therefore hostel/room) is resolved from the impostor's
    // own id, and the victim's identity never enters the record.
    const wiredImpostor = await complaintsFixtures.studentWithRoom(seed)
    const impostor = wiredImpostor.user
    const { user: victim } = studentWithAllocation
    const api = await as(impostor)
    const res = await api.post(BASE).send({
      userId: String(victim._id),
      title: "Filed under someone else",
      description: "The reporter is the impostor, not the victim",
    })
    expect(res.status).toBe(200)
    expect(String(res.body.data.userId)).toBe(String(impostor._id))
    expect(String(res.body.data.hostelId)).toBe(String(wiredImpostor.hostel._id))
  })
})

describe("GET /complaint/all", () => {
  let admin
  let studentA
  let studentB
  let complaintA1
  let complaintA2
  let complaintB1

  beforeAll(async () => {
    admin = await seed.admin()
    const wiredA = await complaintsFixtures.studentWithRoom(seed)
    studentA = wiredA.user
    const wiredB = await complaintsFixtures.studentWithRoom(seed)
    studentB = wiredB.user

    complaintA1 = await complaintsFixtures.createComplaint({
      userId: studentA._id,
      title: "A1 pending plumbing",
      category: "Plumbing",
      status: "Pending",
      hostelId: wiredA.hostel._id,
      unitId: wiredA.unit._id,
      roomId: wiredA.room._id,
    })
    complaintA2 = await complaintsFixtures.createComplaint({
      userId: studentA._id,
      title: "A2 resolved electrical",
      category: "Electrical",
      status: "Resolved",
      hostelId: wiredA.hostel._id,
    })
    complaintB1 = await complaintsFixtures.createComplaint({
      userId: studentB._id,
      title: "B1 pending cleanliness",
      category: "Cleanliness",
      status: "Pending",
      hostelId: wiredB.hostel._id,
    })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(401)
  })

  it("403 for Security", async () => {
    const api = await as(await seed.security())
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(403)
  })

  it("returns a paginated envelope with formatted items", async () => {
    const api = await as(studentA)
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const { items, pagination } = res.body.data
    expect(Array.isArray(items)).toBe(true)
    expect(pagination).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1, hasMore: false })

    const first = items.find((c) => c.id === String(complaintA1._id))
    expect(first).toMatchObject({
      title: "A1 pending plumbing",
      status: "Pending",
      category: "Plumbing",
    })
    expect(first.reportedBy).toMatchObject({
      id: String(studentA._id),
      email: studentA.email,
      name: studentA.name,
      role: "Student",
    })
    expect(typeof first.createdDate).toBe("string")
    expect(first.password).toBeUndefined()
  })

  it("scopes Students to their own complaints only", async () => {
    const api = await as(studentB)
    const res = await api.get(`${BASE}/all`)
    expect(res.body.data.pagination.total).toBe(1)
    expect(res.body.data.items[0].title).toBe("B1 pending cleanliness")
  })

  it("shows everything to an Admin", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/all`)
    expect(res.body.data.pagination.total).toBeGreaterThanOrEqual(3)
  })

  it("supports status and category filters", async () => {
    const api = await as(studentA)
    const byStatus = await api.get(`${BASE}/all`).query({ status: "Resolved" })
    expect(byStatus.body.data.items.map((c) => c.title)).toEqual(["A2 resolved electrical"])

    const byCategory = await api.get(`${BASE}/all`).query({ category: "Plumbing" })
    expect(byCategory.body.data.items.map((c) => c.title)).toEqual(["A1 pending plumbing"])
  })

  it("paginates with page/limit", async () => {
    const api = await as(studentA)
    const res = await api.get(`${BASE}/all`).query({ page: 1, limit: 1 })
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2, hasMore: true })
    expect(res.body.data.items).toHaveLength(1)
  })

  it("formats roomNumber as <unit>-<room> when both exist", async () => {
    const api = await as(studentA)
    const res = await api.get(`${BASE}/all`).query({ status: "Pending" })
    const item = res.body.data.items[0]
    expect(item.roomNumber).toMatch(/.+/) // "<unitNumber>-<roomNumber>"
    expect(item.roomNumber).toContain("-")
  })
})

describe("GET /complaint/student/complaints/:userId", () => {
  let admin
  let warden
  let student
  let otherStudent

  beforeAll(async () => {
    admin = await seed.admin()
    warden = await seed.warden()
    const wired = await complaintsFixtures.studentWithRoom(seed)
    student = wired.user
    otherStudent = await seed.student()
    await complaintsFixtures.createComplaint({
      userId: student._id,
      title: "Student scoped complaint",
      hostelId: wired.hostel._id,
    })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/student/complaints/${student._id}`)
    expect(res.status).toBe(401)
  })

  it("403 for a Student (staff-only route)", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/student/complaints/${student._id}`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("returns the target student's complaints for an Admin", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/student/complaints/${student._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.pagination.total).toBe(1)
    expect(res.body.data.items[0]).toMatchObject({
      title: "Student scoped complaint",
      reportedBy: expect.objectContaining({ id: String(student._id) }),
    })
  })

  it("works for a Warden too", async () => {
    const api = await as(warden)
    const res = await api.get(`${BASE}/student/complaints/${student._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.pagination.total).toBe(1)
  })

  it("returns an empty paginated list for a student with no complaints", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/student/complaints/${otherStudent._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ items: [], pagination: { total: 0 } })
  })
})

describe("PUT /complaint/update-status/:id (legacy, Maintenance Staff only)", () => {
  let maintenance
  let warden
  let student
  let complaint

  beforeAll(async () => {
    maintenance = await seed.maintenanceStaff()
    warden = await seed.warden()
    student = await seed.student()
    complaint = await complaintsFixtures.createComplaint({ userId: student._id, title: "Legacy flow" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/update-status/${complaint._id}`).send({ status: "In Progress" })
    expect(res.status).toBe(401)
  })

  it("403 for Warden and Student (maintenance-only)", async () => {
    const wardenApi = await as(warden)
    const w = await wardenApi.put(`${BASE}/update-status/${complaint._id}`).send({ status: "In Progress" })
    expect(w.status).toBe(403)
    expect(w.body.message).toMatch(/Access denied/)

    const studentApi = await as(student)
    const s = await studentApi.put(`${BASE}/update-status/${complaint._id}`).send({ status: "In Progress" })
    expect(s.status).toBe(403)
  })

  it("404 for an unknown complaint id", async () => {
    const api = await as(maintenance)
    const res = await api
      .put(`${BASE}/update-status/000000000000000000000000`)
      .send({ status: "In Progress" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Complaint not found")
  })

  it("422 for a status outside the enum", async () => {
    const api = await as(maintenance)
    const res = await api
      .put(`${BASE}/update-status/${complaint._id}`)
      .send({ status: "Teleported" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Validation failed")
  })

  it("sets status, assignee and notes in one call", async () => {
    const api = await as(maintenance)
    const res = await api.put(`${BASE}/update-status/${complaint._id}`).send({
      status: "In Progress",
      assignedTo: String(maintenance._id),
      resolutionNotes: "Parts ordered",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("In Progress")

    // verify persistence through the list API
    const list = await as(student)
    const got = await list.get(`${BASE}/all`).query({ status: "In Progress" })
    const item = got.body.data.items.find((c) => c.id === String(complaint._id))
    expect(item).toBeTruthy()
    expect(item.assignedTo.name).toBe(maintenance.name)
    expect(item.resolutionNotes).toBe("Parts ordered")
  })

  it("stamps resolutionDate when moved to Resolved", async () => {
    const api = await as(maintenance)
    const res = await api
      .put(`${BASE}/update-status/${complaint._id}`)
      .send({ status: "Resolved", resolutionNotes: "Fixed" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Resolved")
    expect(res.body.data.resolutionDate).toBeTruthy()

    const list = await as(student)
    const got = await list.get(`${BASE}/all`).query({ status: "Resolved" })
    const item = got.body.data.items.find((c) => c.id === String(complaint._id))
    expect(item.resolutionNotes).toBe("Fixed")
    expect(item.resolutionDate).toBeTruthy()
  })
})

describe("PUT /complaint/:complaintId/status", () => {
  let warden
  let student
  let complaint

  beforeAll(async () => {
    warden = await seed.warden()
    student = await seed.student()
    complaint = await complaintsFixtures.createComplaint({ userId: student._id, title: "Status flow" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${complaint._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(401)
  })

  it("403 for a Student (not in the route guard)", async () => {
    const api = await as(student)
    const res = await api.put(`${BASE}/${complaint._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Access denied/)
  })

  it("404 for an unknown complaint id", async () => {
    const api = await as(warden)
    const res = await api
      .put(`${BASE}/000000000000000000000000/status`)
      .send({ status: "In Progress" })
    expect(res.status).toBe(404)
  })

  it("moves Pending -> In Progress without a resolver", async () => {
    const api = await as(warden)
    const res = await api.put(`${BASE}/${complaint._id}/status`).send({ status: "In Progress" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.status).toBe("In Progress")
    expect(res.body.data.resolvedBy).toBeNull()
    expect(res.body.data.resolutionDate).toBeNull()
  })

  it("records resolvedBy and resolutionDate when resolved by a Warden", async () => {
    const api = await as(warden)
    const res = await api.put(`${BASE}/${complaint._id}/status`).send({ status: "Resolved" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Resolved")
    expect(String(res.body.data.resolvedBy)).toBe(String(warden._id))
    expect(res.body.data.resolutionDate).toBeTruthy()
  })

  it("rejects a bogus status with 422", async () => {
    const api = await as(warden)
    const res = await api.put(`${BASE}/${complaint._id}/status`).send({ status: "Vanished" })
    expect(res.status).toBe(422)
  })
})

describe("PUT /complaint/:complaintId/resolution-notes", () => {
  let admin
  let student
  let complaint

  beforeAll(async () => {
    admin = await seed.admin()
    student = await seed.student()
    complaint = await complaintsFixtures.createComplaint({ userId: student._id, title: "Notes flow" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${complaint._id}/resolution-notes`).send({ resolutionNotes: "n" })
    expect(res.status).toBe(401)
  })

  it("403 for a Student", async () => {
    const api = await as(student)
    const res = await api.put(`${BASE}/${complaint._id}/resolution-notes`).send({ resolutionNotes: "n" })
    expect(res.status).toBe(403)
  })

  it("404 for an unknown complaint id", async () => {
    const api = await as(admin)
    const res = await api
      .put(`${BASE}/000000000000000000000000/resolution-notes`)
      .send({ resolutionNotes: "n" })
    expect(res.status).toBe(404)
  })

  it("persists the notes (verified through the list API)", async () => {
    const api = await as(admin)
    const res = await api
      .put(`${BASE}/${complaint._id}/resolution-notes`)
      .send({ resolutionNotes: "Replaced the gasket" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const ownerApi = await as(student)
    const got = await ownerApi.get(`${BASE}/all`)
    const item = got.body.data.items.find((c) => c.id === String(complaint._id))
    expect(item.resolutionNotes).toBe("Replaced the gasket")
  })
})

describe("PUT /complaint/:complaintId/category", () => {
  let admin
  let maintenance
  let student
  let complaint

  beforeAll(async () => {
    admin = await seed.admin()
    maintenance = await seed.maintenanceStaff()
    student = await seed.student()
    complaint = await complaintsFixtures.createComplaint({
      userId: student._id,
      title: "Category flow",
      category: "Other",
    })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${complaint._id}/category`).send({ category: "Civil" })
    expect(res.status).toBe(401)
  })

  it("403 for a Student and for Maintenance Staff", async () => {
    const studentApi = await as(student)
    const s = await studentApi.put(`${BASE}/${complaint._id}/category`).send({ category: "Civil" })
    expect(s.status).toBe(403)

    const maintApi = await as(maintenance)
    const m = await maintApi.put(`${BASE}/${complaint._id}/category`).send({ category: "Civil" })
    expect(m.status).toBe(403)
  })

  it("400 for a category outside the allowed set", async () => {
    const api = await as(admin)
    const res = await api
      .put(`${BASE}/${complaint._id}/category`)
      .send({ category: "Gardening" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid complaint category")
  })

  it("404 for an unknown complaint id", async () => {
    const api = await as(admin)
    const res = await api
      .put(`${BASE}/000000000000000000000000/category`)
      .send({ category: "Civil" })
    expect(res.status).toBe(404)
  })

  it("updates the category (verified through the list API)", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/${complaint._id}/category`).send({ category: "Internet" })
    expect(res.status).toBe(200)
    expect(res.body.data.category).toBe("Internet")

    const ownerApi = await as(student)
    const got = await ownerApi.get(`${BASE}/all`).query({ category: "Internet" })
    expect(got.body.data.items.map((c) => c.id)).toContain(String(complaint._id))
  })
})

describe("POST /complaint/:complaintId/feedback (owner-only)", () => {
  let admin
  let warden
  let student
  let ownComplaint
  let foreignComplaint

  beforeAll(async () => {
    admin = await seed.admin()
    warden = await seed.warden()
    student = await seed.student()
    ownComplaint = await complaintsFixtures.createComplaint({
      userId: student._id,
      title: "Feedback flow",
      status: "Resolved",
    })
    foreignComplaint = await complaintsFixtures.createComplaint({
      userId: admin._id ? (await seed.student())._id : null,
      title: "Someone else's complaint",
      status: "Resolved",
    })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/${ownComplaint._id}/feedback`).send({ feedback: "f" })
    expect(res.status).toBe(401)
  })

  it("403 for Maintenance Staff (not in the route guard)", async () => {
    const api = await as(await seed.maintenanceStaff())
    const res = await api.post(`${BASE}/${ownComplaint._id}/feedback`).send({ feedback: "f" })
    expect(res.status).toBe(403)
  })

  it("403 even for a Warden who is not the complaint owner", async () => {
    // Wardens pass the route guard but the service restricts feedback to the owner.
    const api = await as(warden)
    const res = await api
      .post(`${BASE}/${foreignComplaint._id}/feedback`)
      .send({ feedback: "not mine" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You are not authorized to update feedback for this complaint")
  })

  it("404 for an unknown complaint id", async () => {
    const api = await as(student)
    const res = await api
      .post(`${BASE}/000000000000000000000000/feedback`)
      .send({ feedback: "f" })
    expect(res.status).toBe(404)
  })

  it("lets the owner submit feedback, rating and satisfaction (verified via GET /all)", async () => {
    const api = await as(student)
    const res = await api.post(`${BASE}/${ownComplaint._id}/feedback`).send({
      feedback: "Quick fix, thanks!",
      feedbackRating: 5,
      satisfactionStatus: "Satisfied",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const got = await api.get(`${BASE}/all`).query({ feedbackRating: 5 })
    const item = got.body.data.items.find((c) => c.id === String(ownComplaint._id))
    expect(item).toBeTruthy()
    expect(item.feedback).toBe("Quick fix, thanks!")
    expect(item.feedbackRating).toBe(5)
    expect(item.satisfactionStatus).toBe("Satisfied")
  })
})

describe("GET /complaint/stats", () => {
  let admin
  let studentA
  let studentB

  beforeAll(async () => {
    admin = await seed.admin()
    studentA = await seed.student()
    studentB = await seed.student()
    await complaintsFixtures.createComplaint({ userId: studentA._id, status: "Pending" })
    await complaintsFixtures.createComplaint({ userId: studentA._id, status: "Pending" })
    await complaintsFixtures.createComplaint({ userId: studentA._id, status: "In Progress" })
    await complaintsFixtures.createComplaint({
      userId: studentA._id,
      status: "Resolved",
      resolutionDate: new Date(),
    })
    await complaintsFixtures.createComplaint({ userId: studentB._id, status: "Forwarded to IDO" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(401)
  })

  it("403 for Security", async () => {
    const api = await as(await seed.security())
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(403)
  })

  it("scopes stats to the requesting student's own complaints", async () => {
    const api = await as(studentA)
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({ total: 4, pending: 2, inProgress: 1, resolved: 1, forwardedToIDO: 0 })
  })

  it("aggregates across everyone for an Admin", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/stats`)
    expect(res.body.data.total).toBeGreaterThanOrEqual(5)
    expect(res.body.data.forwardedToIDO).toBeGreaterThanOrEqual(1)
  })
})

describe("hostel-scope constraint (constraint.complaints.scope.hostelIds)", () => {
  let hostelA
  let hostelB
  let constrainedWarden
  let studentA
  let studentB

  beforeAll(async () => {
    hostelA = await complaintsFixtures.createHostel({ name: "Scoped Hostel A" })
    hostelB = await complaintsFixtures.createHostel({ name: "Scoped Hostel B" })

    const wiredA = await complaintsFixtures.studentWithRoom(seed, { hostel: hostelA })
    studentA = wiredA.user
    const wiredB = await complaintsFixtures.studentWithRoom(seed, { hostel: hostelB })
    studentB = wiredB.user

    await complaintsFixtures.createComplaint({
      userId: studentA._id,
      title: "In scope A",
      hostelId: hostelA._id,
    })
    await complaintsFixtures.createComplaint({
      userId: studentB._id,
      title: "Out of scope B",
      hostelId: hostelB._id,
    })

    constrainedWarden = await seed.warden({
      authz: {
        override: {
          constraints: [
            { key: "constraint.complaints.scope.hostelIds", value: [String(hostelA._id)] },
          ],
        },
      },
    })
  })

  it("lists only complaints inside the configured hostels", async () => {
    const api = await as(constrainedWarden)
    const res = await api.get(`${BASE}/all`)
    expect(res.status).toBe(200)
    const titles = res.body.data.items.map((c) => c.title)
    expect(titles).toContain("In scope A")
    expect(titles).not.toContain("Out of scope B")
  })

  it("blocks complaint creation because the requester has no allowed hostel", async () => {
    const api = await as(constrainedWarden)
    const res = await api.post(BASE).send({ title: "t", description: "d" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You are not authorized to create complaints for this hostel")
  })

  it("scopes stats to the configured hostels", async () => {
    const api = await as(constrainedWarden)
    const res = await api.get(`${BASE}/stats`)
    expect(res.body.data).toEqual({ total: 1, pending: 1, inProgress: 0, resolved: 0, forwardedToIDO: 0 })
  })

  it("scopes per-student listings to the configured hostels", async () => {
    const api = await as(constrainedWarden)
    const res = await api.get(`${BASE}/student/complaints/${studentB._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.items).toEqual([])
  })
})

describe("PUBLIC GET /complaint/feedback/:token", () => {
  let student
  let complaint
  let rawToken

  beforeAll(async () => {
    student = await seed.student({ name: "Token Tina" })
    complaint = await complaintsFixtures.createComplaint({
      userId: student._id,
      title: "Public token complaint",
      status: "Resolved",
      resolutionNotes: "All fixed",
      resolutionDate: new Date(),
    })
    rawToken = await complaintsFixtures.createFeedbackToken({
      complaintId: complaint._id,
      recipientEmail: student.email,
    })
  })

  it("404 for an unknown token", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/feedback/not-a-real-token`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Invalid feedback link not found")
  })

  it("400 for an expired token", async () => {
    const expired = await complaintsFixtures.createFeedbackToken({
      complaintId: complaint._id,
      expiresAt: new Date(Date.now() - 1000),
    })
    const api = await anon()
    const res = await api.get(`${BASE}/feedback/${expired}`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("This feedback link has expired")
  })

  it("400 for an already-used token", async () => {
    const used = await complaintsFixtures.createFeedbackToken({
      complaintId: complaint._id,
      used: true,
    })
    const api = await anon()
    const res = await api.get(`${BASE}/feedback/${used}`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Feedback has already been submitted for this complaint")
  })

  it("returns the public complaint view without authentication", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/feedback/${rawToken}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toMatchObject({
      id: String(complaint._id),
      title: "Public token complaint",
      status: "Resolved",
      resolutionNotes: "All fixed",
      studentName: "Token Tina",
    })
    expect(res.body.data.resolvedBy).toBeNull() // nobody recorded as resolver
  })
})

describe("PUBLIC POST /complaint/feedback/:token", () => {
  let student
  let complaint
  let rawToken
  let legacyToken

  beforeAll(async () => {
    student = await seed.student({ name: "Submit Sam" })
    complaint = await complaintsFixtures.createComplaint({
      userId: student._id,
      title: "Submit token complaint",
      status: "Resolved",
    })
    rawToken = await complaintsFixtures.createFeedbackToken({
      complaintId: complaint._id,
      recipientEmail: student.email,
    })
    legacyToken = await complaintsFixtures.createLegacyFeedbackToken({ complaintId: complaint._id })
  })

  it("404 for an unknown token", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/feedback/not-a-real-token`).send({ feedback: "hi" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Invalid feedback link not found")
  })

  it("400 for an expired legacy token", async () => {
    const expiredLegacy = await complaintsFixtures.createLegacyFeedbackToken({
      complaintId: complaint._id,
      expiresAt: new Date(Date.now() - 1000),
    })
    const api = await anon()
    const res = await api.post(`${BASE}/feedback/${expiredLegacy}`).send({ feedback: "late" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("This feedback link has expired")
  })

  it("accepts feedback once, persists it, then rejects reuse", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/feedback/${rawToken}`).send({
      feedback: "Great service",
      feedbackRating: 4,
      satisfactionStatus: "Satisfied",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Feedback submitted successfully")

    // persisted on the complaint (owner's view through the API)
    const ownerApi = await as(student)
    const got = await ownerApi.get(`${BASE}/all`)
    const item = got.body.data.items.find((c) => c.id === String(complaint._id))
    expect(item).toMatchObject({
      feedback: "Great service",
      feedbackRating: 4,
      satisfactionStatus: "Satisfied",
    })

    // token is single-use
    const again = await api.get(`${BASE}/feedback/${rawToken}`)
    expect(again.status).toBe(400)
    expect(again.body.message).toBe("Feedback has already been submitted for this complaint")

    const againPost = await api.post(`${BASE}/feedback/${rawToken}`).send({ feedback: "again" })
    expect(againPost.status).toBe(400)
  })

  it("still supports the legacy FeedbackToken format end to end", async () => {
    const api = await anon()
    const peek = await api.get(`${BASE}/feedback/${legacyToken}`)
    expect(peek.status).toBe(200)
    expect(peek.body.data.id).toBe(String(complaint._id))

    const submit = await api.post(`${BASE}/feedback/${legacyToken}`).send({
      feedback: "Legacy path works",
      feedbackRating: 3,
      satisfactionStatus: "Unsatisfied",
    })
    expect(submit.status).toBe(200)
    expect(submit.body.message).toBe("Feedback submitted successfully")

    const reused = await api.post(`${BASE}/feedback/${legacyToken}`).send({ feedback: "twice" })
    expect(reused.status).toBe(400)
    expect(reused.body.message).toBe("Feedback has already been submitted for this complaint")
  })
})

describe("ordered workflow: create -> progress -> resolve -> feedback", () => {
  it("walks a complaint through its full lifecycle over the API", async () => {
    const wired = await complaintsFixtures.studentWithRoom(seed)
    const student = wired.user
    const maintenance = await seed.maintenanceStaff()
    const warden = await seed.warden()

    const studentApi = await as(student)
    const maintApi = await as(maintenance)
    const wardenApi = await as(warden)

    // 1. student creates
    const created = await studentApi.post(BASE).send({
      userId: String(student._id),
      title: "Lifecycle fan broken",
      description: "Fan makes horrible noises",
      category: "Electrical",
    })
    expect(created.status).toBe(200)
    const id = created.body.data._id

    // 2. maintenance assigns itself and starts work
    const started = await maintApi.put(`${BASE}/update-status/${id}`).send({
      status: "In Progress",
      assignedTo: String(maintenance._id),
      resolutionNotes: "Ordered a new fan",
    })
    expect(started.status).toBe(200)
    expect(started.body.data.status).toBe("In Progress")

    // 3. warden adds resolution notes
    const notes = await wardenApi
      .put(`${BASE}/${id}/resolution-notes`)
      .send({ resolutionNotes: "Approved replacement" })
    expect(notes.status).toBe(200)

    // 4. warden resolves
    const resolved = await wardenApi.put(`${BASE}/${id}/status`).send({ status: "Resolved" })
    expect(resolved.status).toBe(200)
    expect(String(resolved.body.data.resolvedBy)).toBe(String(warden._id))

    // 5. student sees the final state and leaves feedback
    const listed = await studentApi.get(`${BASE}/all`).query({ status: "Resolved" })
    const item = listed.body.data.items.find((c) => c.id === id)
    expect(item).toBeTruthy()
    expect(item.assignedTo.id).toBe(String(maintenance._id))
    expect(item.resolutionNotes).toBe("Approved replacement")

    const feedback = await studentApi.post(`${BASE}/${id}/feedback`).send({
      feedback: "All good now",
      feedbackRating: 5,
      satisfactionStatus: "Satisfied",
    })
    expect(feedback.status).toBe(200)

    // 6. stats reflect the resolution for this student
    const stats = await studentApi.get(`${BASE}/stats`)
    expect(stats.body.data.resolved).toBeGreaterThanOrEqual(1)
  })
})
