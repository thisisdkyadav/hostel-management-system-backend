/**
 * DisCo (Disciplinary Committee) module integration tests (/api/v1/disCo).
 *
 * Two route families:
 *  - legacy per-student disciplinary-action CRUD (/add, /update/:id,
 *    /update/:id/reminders/:rid/done, DELETE /:id, GET /:studentId)
 *  - admin disciplinary-process workflow (/process/cases...)
 *
 * Legacy response style: controllers emit `result.data` directly; the
 * success() message-hoist means e.g. POST /add responds `{}` and
 * POST /process/cases responds `{ case }`.
 *
 * NOTE ON EMAIL: SMTP is not configured in this environment. The single-
 * recipient email path fails (surfaced as 400), while the multi-recipient
 * bulk path reports per-recipient failures as a *successful* send result,
 * so the send-email happy path below uses two recipients.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon, getApp } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

/** GET a binary response (e.g. the zip export) with the given session cookie. */
async function binaryGet(apiClient, url) {
  const app = await getApp()
  return request(app)
    .get(url)
    .set("Cookie", apiClient.cookie)
    .buffer(true)
    .parse((res, cb) => {
      const chunks = []
      res.on("data", (c) => chunks.push(c))
      res.on("end", () => cb(null, Buffer.concat(chunks)))
    })
}

const CASES = "/api/v1/disCo/process/cases"
const future = (days) => new Date(Date.now() + days * 24 * 3600 * 1000)

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("disco — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.post("/api/v1/disCo/add").send({})).status).toBe(401)
    expect((await api.get("/api/v1/disCo/000000000000000000000000")).status).toBe(401)
    expect((await api.post(CASES).send({})).status).toBe(401)
    expect((await api.get(CASES)).status).toBe(401)
  })

  it("legacy writes are Admin-only; reads allow the warden family", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.post("/api/v1/disCo/add").send({})).status).toBe(403)
    expect((await studentApi.get("/api/v1/disCo/000000000000000000000000")).status).toBe(403)

    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.get("/api/v1/disCo/000000000000000000000000")).status).toBe(200)
    expect(
      (await wardenApi.put("/api/v1/disCo/update/000000000000000000000000").send({ remarks: "x" })).status
    ).toBe(403)
    expect((await wardenApi.delete("/api/v1/disCo/000000000000000000000000")).status).toBe(403)
  })

  it("process workflow routes are Admin/Super-Admin only", async () => {
    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.post(CASES).send({ complaintPdfUrl: "/uploads/x.pdf" })).status).toBe(403)
    expect((await wardenApi.get(CASES)).status).toBe(403)
    expect(
      (await wardenApi.patch(`${CASES}/000000000000000000000000/stage2`).send({})).status
    ).toBe(403)
  })
})

describe("disco — legacy action CRUD", () => {
  let adminApi, studentUser

  const validPayload = (overrides = {}) => ({
    studentId: null,
    reason: "Ragging incident in block C",
    actionTaken: "Hostel restriction for 30 days",
    date: new Date().toISOString(),
    punishmentStartDate: new Date().toISOString(),
    punishmentEndDate: future(30).toISOString(),
    remarks: "First offense",
    ...overrides,
  })

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: studentUser } = await campusSeed.studentWithProfile())
  })

  it("404 when the student has no profile", async () => {
    const stranger = await seed.student()
    const res = await adminApi
      .post("/api/v1/disCo/add")
      .send(validPayload({ studentId: String(stranger._id) }))
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Student profile not found")
  })

  it("400 for missing/invalid dates and bad punishment ranges", async () => {
    const base = validPayload({ studentId: String(studentUser._id) })

    const noDate = await adminApi.post("/api/v1/disCo/add").send({ ...base, date: undefined })
    expect(noDate.status).toBe(400)
    expect(noDate.body.message).toBe("Creation date is required")

    const badDate = await adminApi.post("/api/v1/disCo/add").send({ ...base, date: "not-a-date" })
    expect(badDate.status).toBe(400)
    expect(badDate.body.message).toBe("Invalid creation date")

    const inverted = await adminApi.post("/api/v1/disCo/add").send({
      ...base,
      punishmentStartDate: future(10).toISOString(),
      punishmentEndDate: new Date().toISOString(),
    })
    expect(inverted.status).toBe(400)
    expect(inverted.body.message).toBe("Punishment end date cannot be before punishment start date")
  })

  it("400 for malformed reminderItems", async () => {
    const base = validPayload({ studentId: String(studentUser._id) })

    const notArray = await adminApi.post("/api/v1/disCo/add").send({ ...base, reminderItems: "nope" })
    expect(notArray.status).toBe(400)
    expect(notArray.body.message).toBe("Invalid reminder items provided")

    const noAction = await adminApi
      .post("/api/v1/disCo/add")
      .send({ ...base, reminderItems: [{ dueDate: future(5) }] })
    expect(noAction.status).toBe(400)
    expect(noAction.body.message).toBe("Each reminder item must include action text")

    const noDue = await adminApi
      .post("/api/v1/disCo/add")
      .send({ ...base, reminderItems: [{ action: "Submit apology" }] })
    expect(noDue.status).toBe(400)
    expect(noDue.body.message).toBe("Each reminder item must include a valid due date")
  })

  it("201 creates an action (empty body due to message-hoist); visible via GET", async () => {
    const res = await adminApi
      .post("/api/v1/disCo/add")
      .send(
        validPayload({
          studentId: String(studentUser._id),
          reminderItems: [{ action: "Submit written apology", dueDate: future(7).toISOString() }],
        })
      )
    expect(res.status).toBe(201)
    expect(res.body).toEqual({})

    const listRes = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.success).toBe(true)
    expect(listRes.body.actions).toHaveLength(1)

    const action = listRes.body.actions[0]
    expect(action.reason).toBe("Ragging incident in block C")
    expect(action.actionTaken).toBe("Hostel restriction for 30 days")
    expect(action.userId.id).toBe(String(studentUser._id))
    expect(action.reminderItems).toHaveLength(1)
    expect(action.reminderItems[0].isDone).toBe(false)
  })

  it("PUT updates remarks and reminder items; validates inputs", async () => {
    const listRes = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    const actionId = String(listRes.body.actions[0]._id)

    const res = await adminApi
      .put(`/api/v1/disCo/update/${actionId}`)
      .send({ remarks: "Updated after review" })
    expect(res.status).toBe(200)
    expect(res.body.action.remarks).toBe("Updated after review")

    const remindersRes = await adminApi.put(`/api/v1/disCo/update/${actionId}`).send({
      reminderItems: [
        {
          action: "Submit written apology",
          dueDate: future(7).toISOString(),
          isDone: true,
          doneAt: new Date().toISOString(),
        },
      ],
    })
    expect(remindersRes.status).toBe(200)
    expect(remindersRes.body.action.reminderItems[0].isDone).toBe(true)

    const badReminder = await adminApi
      .put(`/api/v1/disCo/update/${actionId}`)
      .send({ reminderItems: [{ action: "", dueDate: future(1) }] })
    expect(badReminder.status).toBe(400)

    const badDateUpdate = await adminApi
      .put(`/api/v1/disCo/update/${actionId}`)
      .send({ date: "garbage" })
    expect(badDateUpdate.status).toBe(400)
    expect(badDateUpdate.body.message).toBe("Invalid creation date")

    const missing = await adminApi
      .put("/api/v1/disCo/update/000000000000000000000000")
      .send({ remarks: "x" })
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("DisCo action not found")

    // malformed ids propagate as the global handler's 400 "Invalid ID format"
    const garbage = await adminApi.put("/api/v1/disCo/update/garbage").send({ remarks: "x" })
    expect(garbage.status).toBe(400)
    expect(garbage.body.message).toBe("Invalid ID format")
  })

  it("PATCH reminder done endpoint marks completion once", async () => {
    const listRes = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    const action = listRes.body.actions[0]
    const actionId = String(action._id)
    const reminderId = String(action.reminderItems[0]._id)

    // The PUT suite above left this item isDone — reset it so the PATCH path
    // (which assigns doneBy) actually runs.
    const reset = await adminApi.put(`/api/v1/disCo/update/${actionId}`).send({
      reminderItems: [{ action: "Submit written apology", dueDate: future(7).toISOString() }],
    })
    expect(reset.body.action.reminderItems[0].isDone).toBe(false)

    // The PUT above replaced reminderItems with fresh subdocs — re-read ids.
    const refreshed = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    const freshActionId = String(refreshed.body.actions[0]._id)
    const freshReminderId = String(refreshed.body.actions[0].reminderItems[0]._id)

    const badActionId = await adminApi.patch(
      `/api/v1/disCo/update/garbage/reminders/${freshReminderId}/done`
    )
    expect(badActionId.status).toBe(400)
    expect(badActionId.body.message).toBe("Invalid DisCo action id")

    const badReminderId = await adminApi.patch(
      `/api/v1/disCo/update/${freshActionId}/reminders/garbage/done`
    )
    expect(badReminderId.status).toBe(400)
    expect(badReminderId.body.message).toBe("Invalid reminder item id")

    const noReminder = await adminApi.patch(
      `/api/v1/disCo/update/${freshActionId}/reminders/000000000000000000000000/done`
    )
    expect(noReminder.status).toBe(404)
    expect(noReminder.body.message).toBe("Reminder item not found")

    const done = await adminApi.patch(
      `/api/v1/disCo/update/${freshActionId}/reminders/${freshReminderId}/done`
    )
    expect(done.status).toBe(200)
    // The distinguishing message lives in result.message and is dropped by the
    // legacy controller — assert on state instead.
    expect(done.body.action.reminderItems[0].isDone).toBe(true)
    expect(done.body.action.reminderItems[0].doneBy.id).toBeDefined()

    const again = await adminApi.patch(
      `/api/v1/disCo/update/${freshActionId}/reminders/${freshReminderId}/done`
    )
    expect(again.status).toBe(200)
    expect(again.body.action.reminderItems[0].isDone).toBe(true)
  })

  it("DELETE removes the action", async () => {
    const listRes = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    const actionId = String(listRes.body.actions[0]._id)

    const delRes = await adminApi.delete(`/api/v1/disCo/${actionId}`)
    expect(delRes.status).toBe(200)
    expect(delRes.body).toEqual({})

    const goneRes = await adminApi.get(`/api/v1/disCo/${studentUser._id}`)
    expect(goneRes.body.actions).toHaveLength(0)

    const missing = await adminApi.delete(`/api/v1/disCo/${actionId}`)
    expect(missing.status).toBe(404)
  })
})

describe("disco — process workflow", () => {
  let adminApi, superAdminApi, accusing, accused

  const createCase = async () => {
    const res = await adminApi
      .post(CASES)
      .send({ complaintPdfUrl: "/uploads/complaints/test-complaint.pdf", complaintPdfName: "test-complaint.pdf" })
    expect(res.status).toBe(201)
    return res.body.case
  }

  const completeStageTwo = async (caseId) => {
    const res = await adminApi.patch(`${CASES}/${caseId}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accused._id)],
      statements: [
        { studentUserId: String(accusing._id), statementPdfUrl: "media://stmt-accusing" },
        { studentUserId: String(accused._id), statementPdfUrl: "media://stmt-accused" },
      ],
      evidenceDocuments: [{ pdfUrl: "media://evidence-cctv", pdfName: "cctv.pdf" }],
      extraDocuments: [],
    })
    expect(res.status).toBe(200)
    return res.body.case
  }

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    superAdminApi = await as(await seed.superAdmin())
    ;({ user: accusing } = await campusSeed.studentWithProfile({ profile: { rollNumber: "DSC001" } }))
    ;({ user: accused } = await campusSeed.studentWithProfile({ profile: { rollNumber: "DSC002" } }))
  })

  it("POST rejects a case without a complaint PDF", async () => {
    const res = await adminApi.post(CASES).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Complaint PDF is required")
  })

  it("Super Admin can also create cases", async () => {
    const res = await superAdminApi
      .post(CASES)
      .send({ complaintPdfUrl: "/uploads/complaints/sa-case.pdf" })
    expect(res.status).toBe(201)
    expect(res.body.case.complaintPdfName).toBe("sa-case.pdf") // derived from URL when omitted
  })

  it("creates a case under_process with a timeline entry", async () => {
    const kase = await createCase()
    expect(kase.caseStatus).toBe("under_process")
    expect(kase.startedBy.id).toBeDefined()
    expect(kase.timeline).toHaveLength(1)
    expect(kase.timeline[0].action).toBe("case_created")
    expect(kase.finalDecision.status).toBe("pending")
    expect(kase.selectedStudents.accusing).toEqual([])
  })

  it("lists cases with the paginated envelope and filters by status", async () => {
    const res = await adminApi.get(`${CASES}?caseStatus=under_process`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(res.body.items.length).toBeGreaterThanOrEqual(2)
    expect(res.body.items.every((c) => c.caseStatus === "under_process")).toBe(true)
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 })
    expect(res.body.pagination.total).toBeGreaterThanOrEqual(2)
  })

  it("GET by id validates the id and returns 404 for unknown ids", async () => {
    expect((await adminApi.get(`${CASES}/garbage`)).status).toBe(400)
    const missing = await adminApi.get(`${CASES}/000000000000000000000000`)
    expect(missing.status).toBe(404)
    expect(missing.body.message).toBe("Disciplinary process case not found")
  })

  it("stage2 enforces its validation rules", async () => {
    const kase = await createCase()

    const noAccused = await adminApi
      .patch(`${CASES}/${kase.id}/stage2`)
      .send({ accusingStudentIds: [String(accusing._id)], accusedStudentIds: [] })
    expect(noAccused.status).toBe(400)
    expect(noAccused.body.message).toBe("Select at least one accused student")

    const overlap = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accusing._id)],
    })
    expect(overlap.status).toBe(400)
    expect(overlap.body.message).toBe("A student cannot be in both accusing and accused groups")

    const unknownStudent = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [],
      accusedStudentIds: ["000000000000000000000000"],
    })
    expect(unknownStudent.status).toBe(400)
    expect(unknownStudent.body.message).toMatch(/do not exist in student profiles/)

    const statementCountMismatch = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accused._id)],
      statements: [{ studentUserId: String(accused._id), statementPdfUrl: "/uploads/s.pdf" }],
    })
    expect(statementCountMismatch.status).toBe(400)
    expect(statementCountMismatch.body.message).toMatch(/exactly one statement PDF/)

    const roleMismatch = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accused._id)],
      statements: [
        { studentUserId: String(accusing._id), studentRole: "accused", statementPdfUrl: "/uploads/a.pdf" },
        { studentUserId: String(accused._id), statementPdfUrl: "/uploads/b.pdf" },
      ],
    })
    expect(roleMismatch.status).toBe(400)
    expect(roleMismatch.body.message).toBe("Statement student role does not match selected student group")

    const missingStatementPdf = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accused._id)],
      statements: [
        { studentUserId: String(accusing._id), statementPdfUrl: "   " },
        { studentUserId: String(accused._id), statementPdfUrl: "media://b" },
      ],
    })
    expect(missingStatementPdf.status).toBe(400)
    expect(missingStatementPdf.body.message).toBe("Statement PDF is required for each selected student")

    // Statement and document URLs must be stored media references.
    const nonMediaStatement = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [String(accusing._id)],
      accusedStudentIds: [String(accused._id)],
      statements: [
        { studentUserId: String(accusing._id), statementPdfUrl: "/uploads/not-media.pdf" },
        { studentUserId: String(accused._id), statementPdfUrl: "media://b" },
      ],
    })
    expect(nonMediaStatement.status).toBe(400)
    expect(nonMediaStatement.body.message).toBe("Statement PDF must be a stored media reference")

    const nonMediaEvidence = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [],
      accusedStudentIds: [String(accused._id)],
      statements: [{ studentUserId: String(accused._id), statementPdfUrl: "media://b" }],
      evidenceDocuments: [{ pdfUrl: "/uploads/also-not-media.pdf" }],
    })
    expect(nonMediaEvidence.status).toBe(400)
    expect(nonMediaEvidence.body.message).toBe("Document must be a stored media reference")
  })

  it("stage2 happy path saves students, statements and evidence", async () => {
    const kase = await createCase()
    const saved = await completeStageTwo(String(kase.id))

    expect(saved.caseStatus).toBe("under_process")
    expect(saved.selectedStudents.accusing.map((s) => s.id)).toContain(String(accusing._id))
    expect(saved.selectedStudents.accused.map((s) => s.id)).toContain(String(accused._id))
    expect(saved.statements).toHaveLength(2)
    expect(saved.statements.every((s) => s.statementPdfUrl)).toBe(true)
    expect(saved.evidenceDocuments).toHaveLength(1)
    expect(saved.evidenceDocuments[0].pdfName).toBe("cctv.pdf")
    expect(saved.timeline.some((t) => t.action === "stage2_documents_saved")).toBe(true)
  })

  it("blocks downstream steps until stage2 is complete", async () => {
    const kase = await createCase()

    const emailTooEarly = await adminApi.post(`${CASES}/${kase.id}/send-email`).send({
      to: ["a@x.com", "b@x.com"],
      subject: "s",
      body: "b",
    })
    expect(emailTooEarly.status).toBe(400)
    expect(emailTooEarly.body.message).toBe("Complete stage 2 documents before sending committee email")

    const skipTooEarly = await adminApi.post(`${CASES}/${kase.id}/skip-email`).send({})
    expect(skipTooEarly.status).toBe(400)

    const minutesTooEarly = await adminApi
      .patch(`${CASES}/${kase.id}/committee-minutes`)
      .send({ pdfUrl: "media://minutes-early" })
    expect(minutesTooEarly.status).toBe(400)

    const finalizeTooEarly = await adminApi
      .patch(`${CASES}/${kase.id}/finalize`)
      .send({ decision: "reject", decisionDescription: "nope" })
    expect(finalizeTooEarly.status).toBe(400)
    expect(finalizeTooEarly.body.message).toBe("Complete stage 2 documents before final decision")
  })

  it("send-email validates payload and logs the bulk send (SMTP disabled)", async () => {
    const kase = await createCase()
    await completeStageTwo(String(kase.id))

    const noRecipients = await adminApi
      .post(`${CASES}/${kase.id}/send-email`)
      .send({ subject: "s", body: "b" })
    expect(noRecipients.status).toBe(400)
    expect(noRecipients.body.message).toBe("At least one recipient email is required")

    const noSubject = await adminApi
      .post(`${CASES}/${kase.id}/send-email`)
      .send({ to: ["a@x.com"], body: "b" })
    expect(noSubject.status).toBe(400)
    expect(noSubject.body.message).toBe("Email subject is required")

    // Single recipient → direct SMTP send → not configured → 400.
    const singleRecipient = await adminApi.post(`${CASES}/${kase.id}/send-email`).send({
      to: ["one@x.com"],
      subject: "Committee notice",
      body: "Please review",
    })
    expect(singleRecipient.status).toBe(400)
    expect(singleRecipient.body.message).toMatch(/Failed to send email/)
    // SUSPECTED BUG: with SMTP unconfigured, the multi-recipient bulk path
    // still reports success (sent: 0, failed: n) and the case proceeds as if
    // the committee email went out.
    const bulk = await adminApi.post(`${CASES}/${kase.id}/send-email`).send({
      to: ["one@x.com", "two@x.com"],
      subject: "Committee notice",
      body: "Please review the attached documents",
    })
    expect(bulk.status).toBe(200)
    expect(bulk.body.emailResult.sent).toBe(0)
    expect(bulk.body.emailResult.failed).toBe(2)

    const detail = await adminApi.get(`${CASES}/${kase.id}`)
    expect(detail.body.case.emailLogs).toHaveLength(1)
    expect(detail.body.case.emailLogs[0].to).toEqual(["one@x.com", "two@x.com"])
    expect(detail.body.case.emailLogs[0].attachments.length).toBeGreaterThan(0)
    expect(detail.body.case.timeline.some((t) => t.action === "committee_email_sent")).toBe(true)
  })

  it("skip-email records the skip once and only once", async () => {
    const kase = await createCase()
    await completeStageTwo(String(kase.id))

    const res = await adminApi
      .post(`${CASES}/${kase.id}/skip-email`)
      .send({ reason: "Committee decided in person" })
    expect(res.status).toBe(200)
    expect(res.body.case.emailLogs).toHaveLength(1)
    expect(res.body.case.emailLogs[0].subject).toBe("Committee email step skipped")
    expect(res.body.case.timeline.some((t) => t.action === "committee_email_skipped")).toBe(true)

    const again = await adminApi.post(`${CASES}/${kase.id}/skip-email`).send({})
    expect(again.status).toBe(400)
    expect(again.body.message).toBe("Committee email step is already completed")
  })

  it("committee minutes require the email step first, then persist", async () => {
    const kase = await createCase()
    await completeStageTwo(String(kase.id))
    await adminApi.post(`${CASES}/${kase.id}/skip-email`).send({})

    const noUrl = await adminApi.patch(`${CASES}/${kase.id}/committee-minutes`).send({})
    expect(noUrl.status).toBe(400)
    expect(noUrl.body.message).toBe("Meeting minutes PDF is required")

    const nonMedia = await adminApi
      .patch(`${CASES}/${kase.id}/committee-minutes`)
      .send({ pdfUrl: "/uploads/not-media.pdf" })
    expect(nonMedia.status).toBe(400)
    expect(nonMedia.body.message).toBe("Meeting minutes PDF must be a stored media reference")

    const res = await adminApi
      .patch(`${CASES}/${kase.id}/committee-minutes`)
      .send({ pdfUrl: "media://meeting-minutes", pdfName: "meeting.pdf" })
    expect(res.status).toBe(200)
    expect(res.body.case.committeeMeetingMinutes.pdfName).toBe("meeting.pdf")
    // uploadedBy is passed through unpopulated by the admin case view.
    expect(res.body.case.committeeMeetingMinutes.uploadedBy).toBeDefined()
    expect(res.body.case.timeline.some((t) => t.action === "committee_minutes_uploaded")).toBe(true)
  })

  it("finalize: reject path records the rejection and locks the case", async () => {
    const kase = await createCase()
    await completeStageTwo(String(kase.id))
    await adminApi.post(`${CASES}/${kase.id}/skip-email`).send({})
    await adminApi.patch(`${CASES}/${kase.id}/committee-minutes`).send({ pdfUrl: "media://minutes-reject" })

    const badDecision = await adminApi
      .patch(`${CASES}/${kase.id}/finalize`)
      .send({ decision: "maybe" })
    expect(badDecision.status).toBe(400)
    expect(badDecision.body.message).toBe("decision must be reject or action")

    const noDescription = await adminApi
      .patch(`${CASES}/${kase.id}/finalize`)
      .send({ decision: "reject" })
    expect(noDescription.status).toBe(400)
    expect(noDescription.body.message).toBe("Final rejection description is required")

    const res = await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "reject",
      decisionDescription: "No evidence of misconduct",
    })
    expect(res.status).toBe(200)
    expect(res.body.case.caseStatus).toBe("final_rejected")
    expect(res.body.case.finalDecision.status).toBe("rejected")
    expect(res.body.case.finalDecision.decisionDescription).toBe("No evidence of misconduct")
    expect(res.body.case.timeline.some((t) => t.action === "final_decision_rejected")).toBe(true)

    const again = await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "reject",
      decisionDescription: "try again",
    })
    expect(again.status).toBe(400)
    expect(again.body.message).toBe("Final decision has already been recorded")

    const editLocked = await adminApi.patch(`${CASES}/${kase.id}/stage2`).send({
      accusingStudentIds: [],
      accusedStudentIds: [String(accused._id)],
    })
    expect(editLocked.status).toBe(400)
    expect(editLocked.body.message).toBe("Cannot edit stage 2 after final decision")
  })

  it("finalize: action path creates DisCo actions for selected students", async () => {
    const kase = await createCase()
    await completeStageTwo(String(kase.id))
    await adminApi.post(`${CASES}/${kase.id}/send-email`).send({
      to: ["c1@x.com", "c2@x.com"],
      subject: "Committee circular",
      body: "Attend the hearing",
    })
    await adminApi.patch(`${CASES}/${kase.id}/committee-minutes`).send({ pdfUrl: "media://minutes-action" })

    const outsideStudent = await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "action",
      reason: "Proven misconduct",
      actionTaken: "Fine + warning",
      date: new Date().toISOString(),
      studentUserIds: ["000000000000000000000000"],
    })
    expect(outsideStudent.status).toBe(400)
    expect(outsideStudent.body.message).toBe("Disciplined students must be selected from stage 2 student groups")

    const noReason = await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "action",
      actionTaken: "Fine",
      date: new Date().toISOString(),
      studentUserIds: [String(accused._id)],
    })
    expect(noReason.status).toBe(400)
    expect(noReason.body.message).toBe("Disciplinary reason is required")

    const res = await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "action",
      reason: "Proven misconduct",
      actionTaken: "Hostel restriction 15 days",
      date: new Date().toISOString(),
      punishmentEndDate: future(15).toISOString(),
      remarks: "Committee decision",
      studentUserIds: [String(accused._id)],
    })
    expect(res.status).toBe(200)
    expect(res.body.createdActions).toHaveLength(1)
    expect(res.body.case.caseStatus).toBe("finalized_with_action")
    expect(res.body.case.finalDecision.status).toBe("action_taken")
    expect(res.body.case.finalDecision.disciplinaryActionMode).toBe("common")
    expect(res.body.case.finalDecision.disciplinedStudents.map((s) => s.id)).toContain(String(accused._id))

    // The created DisCo action shows up in the student's legacy action list.
    const actionsRes = await adminApi.get(`/api/v1/disCo/${accused._id}`)
    const created = actionsRes.body.actions.find(
      (a) => String(a._id) === String(res.body.createdActions[0])
    )
    expect(created).toBeDefined()
    expect(created.actionTaken).toBe("Hostel restriction 15 days")
  })

  it("export: only finalized cases can be exported; bundle is a zip archive", async () => {
    const pending = await createCase()
    const early = await adminApi.get(`${CASES}/${pending.id}/export`)
    expect(early.status).toBe(400)
    expect(early.body.message).toBe("Only completed cases can be exported")

    // Finalize a fresh case through the whole pipeline.
    const kase = await createCase()
    await completeStageTwo(String(kase.id))
    await adminApi.post(`${CASES}/${kase.id}/skip-email`).send({})
    await adminApi.patch(`${CASES}/${kase.id}/committee-minutes`).send({ pdfUrl: "media://minutes-export" })
    await adminApi.patch(`${CASES}/${kase.id}/finalize`).send({
      decision: "reject",
      decisionDescription: "Closed without action",
    })

    // REQUIRES: unreachable file refs become warnings, so no storage service
    // is needed here — the bundle just carries missing-files.txt.
    const zipRes = await binaryGet(adminApi, `${CASES}/${kase.id}/export`)
    expect(zipRes.status).toBe(200)
    expect(zipRes.headers["content-type"]).toBe("application/zip")
    expect(zipRes.headers["content-disposition"]).toMatch(/attachment; filename="disciplinary-case-/)
    const zip = Buffer.from(zipRes.body)
    expect(zip.length).toBeGreaterThan(100)
    // ZIP local-file-header magic bytes "PK".
    expect(zip.slice(0, 2).toString()).toBe("PK")

    expect((await adminApi.get(`${CASES}/garbage/export`)).status).toBe(400)
    expect((await adminApi.get(`${CASES}/000000000000000000000000/export`)).status).toBe(404)
  })
})
