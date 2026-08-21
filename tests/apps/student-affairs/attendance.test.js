import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { saSeed } from "../../helpers/seed/student-affairs.js"

const BASE = "/api/v1/student-affairs/attendance"

beforeAll(async () => {
  await setupTestDb()
  // Scan de-duplication relies on the unique (occurrenceId, studentId) index.
  // After the database drop, MongoDB builds indexes asynchronously — wait for
  // them so back-to-back scans in the tests see the index immediately.
  const { AttendanceRecord } = await import("../../../src/models/index.js")
  await AttendanceRecord.syncIndexes()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("attendance occurrences", () => {
  let admin
  let superAdmin
  let gymkhanaAssigned
  let gymkhanaOther
  let warden
  let studentApi
  let adminApi
  let otherGymkhanaApi

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    gymkhanaAssigned = await saSeed.gymkhana("GS Gymkhana")
    gymkhanaOther = await saSeed.gymkhana("Committee")
    warden = await seed.warden()
    adminApi = await as(admin)
    otherGymkhanaApi = await as(gymkhanaOther)
    studentApi = await as(await seed.student())
  })

  it("GET / rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("GET / rejects roles outside the scanner set with 403", async () => {
    const res = await studentApi.get(BASE)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("POST / rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.post(BASE).send({ title: "Nope" })
    expect(res.status).toBe(401)
  })

  it("POST / rejects non-manager roles with 403 (student)", async () => {
    const res = await studentApi.post(BASE).send({ title: "Nope" })
    expect(res.status).toBe(403)
  })

  it("POST / rejects a warden with 403", async () => {
    const api = await as(warden)
    const res = await api.post(BASE).send({ title: "Nope" })
    expect(res.status).toBe(403)
  })

  it("POST / returns a validation error when title is missing", async () => {
    const res = await adminApi.post(BASE).send({})
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("POST / creates an occurrence (Super Admin falls through the unmapped guard)", async () => {
    const api = await as(superAdmin)
    const res = await api
      .post(BASE)
      .send({ title: "Super Admin Occurrence", location: "Auditorium" })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Attendance occurrence created")
    expect(res.body.data.occurrence.title).toBe("Super Admin Occurrence")
    expect(res.body.data.occurrence.status).toBe("open")
  })

  it("POST / creates an occurrence and filters assignedUsers to assignable roles", async () => {
    const student = await seed.student()
    const res = await adminApi.post(BASE).send({
      title: "Cultural Night Attendance",
      description: "Main gate scan",
      location: "Gate 1",
      assignedUsers: [String(gymkhanaAssigned._id), String(student._id)],
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)

    const occurrence = res.body.data.occurrence
    expect(occurrence.title).toBe("Cultural Night Attendance")
    expect(occurrence.createdBy._id || occurrence.createdBy).toBe(String(admin._id))
    // Students are not in ASSIGNABLE_ROLES -> stripped; Gymkhana kept.
    const assignedIds = (occurrence.assignedUsers || []).map((u) => u._id || u)
    expect(assignedIds.map(String)).toEqual([String(gymkhanaAssigned._id)])

    // Persistence via list.
    const list = await adminApi.get(`${BASE}?search=Cultural`)
    expect(list.status).toBe(200)
    const found = list.body.data.occurrences.find((o) => o.title === "Cultural Night Attendance")
    expect(found).toBeTruthy()
    expect(found.rosterCount).toBe(0)
    expect(found.presentCount).toBe(0)
  })

  it("GET / scopes results for Gymkhana users to created/assigned occurrences only", async () => {
    const assignedApi = await as(gymkhanaAssigned)
    const res = await assignedApi.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.data.occurrences.length).toBeGreaterThan(0)
    for (const occurrence of res.body.data.occurrences) {
      const assignedIds = (occurrence.assignedUsers || []).map((u) => String(u._id || u))
      const creatorId = String(occurrence.createdBy?._id || occurrence.createdBy)
      expect(assignedIds.includes(String(gymkhanaAssigned._id)) || creatorId === String(gymkhanaAssigned._id)).toBe(true)
    }

    // A different Gymkhana user sees none of them.
    const res2 = await otherGymkhanaApi.get(BASE)
    expect(res2.status).toBe(200)
    expect(res2.body.data.occurrences.length).toBe(0)
  })

  it("GET / filters by status query", async () => {
    const res = await adminApi.get(`${BASE}?status=closed`)
    expect(res.status).toBe(200)
    for (const occurrence of res.body.data.occurrences) {
      expect(occurrence.status).toBe("closed")
    }
  })

  it("GET / rejects an invalid status filter with a validation error", async () => {
    const res = await adminApi.get(`${BASE}?status=bogus`)
    expect(res.status).toBe(422)
  })
})

describe("attendance occurrence detail / update / delete", () => {
  let adminApi
  let otherGymkhanaApi
  let occurrence

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
    otherGymkhanaApi = await as(await saSeed.gymkhana("Mega Events"))
    const res = await adminApi.post(BASE).send({ title: "Detail Target" })
    occurrence = res.body.data.occurrence
  })

  it("GET /:id rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/${occurrence._id}`)
    expect(res.status).toBe(401)
  })

  it("GET /:id returns 404 for an unknown id", async () => {
    const res = await adminApi.get(`${BASE}/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/not found/i)
  })

  it("GET /:id returns a validation error for a malformed id", async () => {
    const res = await adminApi.get(`${BASE}/not-an-objectid`)
    expect(res.status).toBe(422)
  })

  it("GET /:id returns 403 for a Gymkhana user without access", async () => {
    const res = await otherGymkhanaApi.get(`${BASE}/${occurrence._id}`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/do not have access/i)
  })

  it("GET /:id returns the occurrence with reconciliation data for admins", async () => {
    const res = await adminApi.get(`${BASE}/${occurrence._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.occurrence._id).toBe(occurrence._id)
    expect(Array.isArray(res.body.data.records)).toBe(true)
    expect(res.body.data.reconciliation.hasRoster).toBe(false)
    expect(res.body.data.reconciliation.presentCount).toBe(0)
  })

  it("PATCH /:id returns 404 for an unknown id", async () => {
    const res = await adminApi
      .patch(`${BASE}/000000000000000000000000`)
      .send({ title: "Ghost" })
    expect(res.status).toBe(404)
  })

  it("PATCH /:id rejects an invalid status value with a validation error", async () => {
    const res = await adminApi.patch(`${BASE}/${occurrence._id}`).send({ status: "paused" })
    expect(res.status).toBe(422)
  })

  it("PATCH /:id updates fields and closes the occurrence", async () => {
    const res = await adminApi.patch(`${BASE}/${occurrence._id}`).send({
      title: "Detail Target Renamed",
      status: "closed",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Attendance occurrence updated")
    expect(res.body.data.occurrence.title).toBe("Detail Target Renamed")
    expect(res.body.data.occurrence.status).toBe("closed")

    const fetched = await adminApi.get(`${BASE}/${occurrence._id}`)
    expect(fetched.body.data.occurrence.status).toBe("closed")
  })

  it("DELETE /:id removes the occurrence and subsequent GETs return 404", async () => {
    const res = await adminApi.delete(`${BASE}/${occurrence._id}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Attendance occurrence deleted")
    expect(res.body.data).toBeNull()

    const fetched = await adminApi.get(`${BASE}/${occurrence._id}`)
    expect(fetched.status).toBe(404)
  })

  it("DELETE /:id returns 404 for an unknown id", async () => {
    const res = await adminApi.delete(`${BASE}/000000000000000000000000`)
    expect(res.status).toBe(404)
  })
})

describe("attendance roster + marking workflow", () => {
  let adminApi
  let assignedGymkhanaApi
  let unassignedGymkhanaApi
  let occurrence
  let qrStudent
  let rollStudent

  beforeAll(async () => {
    const admin = await seed.admin()
    const assigned = await saSeed.gymkhana("Mega Events")
    adminApi = await as(admin)
    assignedGymkhanaApi = await as(assigned)
    unassignedGymkhanaApi = await as(await saSeed.gymkhana("Councils"))

    const res = await adminApi.post(BASE).send({
      title: "Workflow Occurrence",
      assignedUsers: [String(assigned._id)],
    })
    occurrence = res.body.data.occurrence

    qrStudent = await saSeed.studentWithProfile({
      rollNumber: "WF23Q001",
      aesKey: saSeed.aesKey(),
    })
    rollStudent = await saSeed.studentWithProfile({ rollNumber: "wf23r002" })
  })

  it("POST /:id/roster returns 404 for an unknown occurrence", async () => {
    const res = await adminApi
      .post(`${BASE}/000000000000000000000000/roster`)
      .send({ rollNumbers: ["X1"] })
    expect(res.status).toBe(404)
  })

  it("POST /:id/roster rejects an empty roster with a validation error", async () => {
    const res = await adminApi
      .post(`${BASE}/${occurrence._id}/roster`)
      .send({ rollNumbers: [] })
    expect(res.status).toBe(422)
  })

  it("POST /:id/roster normalizes case and dedupes roll numbers", async () => {
    const res = await adminApi
      .post(`${BASE}/${occurrence._id}/roster`)
      .send({ rollNumbers: ["wf23q001", "WF23R002", "wf23q001"] })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Roster updated")
    expect(res.body.data.rosterCount).toBe(2)

    const detail = await adminApi.get(`${BASE}/${occurrence._id}`)
    expect(detail.body.data.reconciliation.hasRoster).toBe(true)
    expect(detail.body.data.reconciliation.rosterCount).toBe(2)
  })

  it("POST /:id/scan returns 403 for an unassigned Gymkhana user", async () => {
    const res = await unassignedGymkhanaApi.post(`${BASE}/${occurrence._id}/scan`).send({
      email: qrStudent.user.email,
      encryptedData: "garbage",
    })
    expect(res.status).toBe(403)
  })

  it("POST /:id/scan returns 400 for an undecryptable QR payload", async () => {
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/scan`).send({
      email: qrStudent.user.email,
      encryptedData: "aa:bb",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid QR code")
  })

  it("POST /:id/scan returns 400 for an expired QR payload", async () => {
    const expired = saSeed.qrPayload(qrStudent.user.aesKey, Date.now() - 60_000)
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/scan`).send({
      email: qrStudent.user.email,
      encryptedData: expired,
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("QR code expired")
  })

  it("POST /:id/scan marks the student present on a valid QR (in roster)", async () => {
    const payload = saSeed.qrPayload(qrStudent.user.aesKey)
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/scan`).send({
      email: qrStudent.user.email.toUpperCase(),
      encryptedData: payload,
      source: "scanner",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Marked present")
    expect(res.body.data.result).toBe("marked")
    expect(res.body.data.inRoster).toBe(true)
    expect(res.body.data.student.rollNumber).toBe("WF23Q001")
    expect(res.body.data.student.email.toLowerCase()).toBe(qrStudent.user.email)
    expect(res.body.data.record.rollNumber).toBe("WF23Q001")
  })

  it("POST /:id/scan is idempotent on repeat scans (duplicate result)", async () => {
    const payload = saSeed.qrPayload(qrStudent.user.aesKey)
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/scan`).send({
      email: qrStudent.user.email,
      encryptedData: payload,
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Already marked present")
    expect(res.body.data.result).toBe("duplicate")
  })

  it("POST /:id/mark returns 404 for an unknown roll number", async () => {
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/mark`).send({
      rollNumber: "NOPE999",
    })
    expect(res.status).toBe(404)
    expect(res.body.message).toContain("NOPE999")
  })

  it("POST /:id/mark marks attendance manually (case-insensitive roll number)", async () => {
    const res = await assignedGymkhanaApi.post(`${BASE}/${occurrence._id}/mark`).send({
      rollNumber: rollStudent.profile.rollNumber.toLowerCase(),
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Marked present")
    expect(res.body.data.result).toBe("marked")
    expect(res.body.data.inRoster).toBe(true)
    expect(res.body.data.student.rollNumber).toBe("WF23R002")
  })

  it("GET /:id reconciles roster vs present records", async () => {
    const detail = await adminApi.get(`${BASE}/${occurrence._id}`)
    const reconciliation = detail.body.data.reconciliation
    expect(reconciliation.hasRoster).toBe(true)
    expect(reconciliation.rosterCount).toBe(2)
    expect(reconciliation.presentCount).toBe(2)
    expect(reconciliation.presentInRosterCount).toBe(2)
    expect(reconciliation.absentRollNumbers).toEqual([])
    expect(reconciliation.extraRollNumbers).toEqual([])
    expect(detail.body.data.records.length).toBe(2)
    for (const record of detail.body.data.records) {
      expect(record.inRoster).toBe(true)
    }
  })

  it("DELETE /:id/records/:recordId removes a record and updates reconciliation", async () => {
    const detail = await adminApi.get(`${BASE}/${occurrence._id}`)
    const record = detail.body.data.records.find(
      (r) => r.rollNumber === "WF23R002"
    )
    expect(record).toBeTruthy()

    const res = await assignedGymkhanaApi
      .delete(`${BASE}/${occurrence._id}/records/${record._id}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Attendance record removed")

    const after = await adminApi.get(`${BASE}/${occurrence._id}`)
    expect(after.body.data.reconciliation.presentCount).toBe(1)
    expect(after.body.data.reconciliation.absentRollNumbers).toEqual(["WF23R002"])
  })

  it("DELETE /:id/records/:recordId returns 404 for an unknown record", async () => {
    const res = await assignedGymkhanaApi
      .delete(`${BASE}/${occurrence._id}/records/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.message).toContain("record")
  })

  it("POST /:id/mark and POST /:id/scan return 400 once the occurrence is closed", async () => {
    const closed = await adminApi.post(BASE).send({ title: "Closed Scan Target" })
    const closedId = closed.body.data.occurrence._id
    await adminApi.patch(`${BASE}/${closedId}`).send({ status: "closed" })

    const markRes = await adminApi.post(`${BASE}/${closedId}/mark`).send({
      rollNumber: qrStudent.profile.rollNumber,
    })
    expect(markRes.status).toBe(400)
    expect(markRes.body.message).toMatch(/closed/i)

    const scanRes = await adminApi.post(`${BASE}/${closedId}/scan`).send({
      email: qrStudent.user.email,
      encryptedData: saSeed.qrPayload(qrStudent.user.aesKey),
    })
    expect(scanRes.status).toBe(400)
    expect(scanRes.body.message).toMatch(/closed/i)
  })
})
