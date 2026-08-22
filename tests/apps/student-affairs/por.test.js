import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { approvalSeed } from "../../helpers/seed/approval-fixtures.js"

/**
 * Integration tests for /api/v1/student-affairs/por.
 *
 * Flow: Student submits a POR verification request against an Admin-managed
 * category -> Gymkhana step reviewers act in order -> Office - Student Affairs
 * (Admin subRole "Student Affairs") forwards to post-SA stages (Officer SA /
 * Associate Dean SA / Dean SA, optionally with explicit assignees) or
 * direct-approves -> approved (certificate downloadable).
 *
 * Controllers use sendStandardResponse -> full { success, message, data,
 * errors } envelope.
 */

const BASE = "/api/v1/student-affairs/por"

describe("student-affairs /por", () => {
  let student // has StudentProfile
  let otherStudent // has StudentProfile
  let plainStudent // no StudentProfile
  let rev1 // Gymkhana step reviewer
  let rev2 // Gymkhana step reviewer
  let adminPlain // Admin without subrole (category management)
  let saAdmin // Admin subRole "Student Affairs"
  let officerSa // Admin subRole "Officer SA"
  let assocDeanSa // Admin subRole "Associate Dean SA"
  let deanSa // Admin subRole "Dean SA"
  let wardenUser
  let categoryId

  const requestPayload = () => ({
    porCategoryId: null,
    hasDisciplinaryAction: false,
    positionTitle: "Cultural Secretary",
    positionDetails: "Led the annual cultural fest team of forty volunteers.",
    tenure: "2025-2026",
    supportingDocumentUrl: "https://files.example.com/por-proof.pdf",
    supportingDocumentName: "por-proof.pdf",
    undertakingAccepted: true,
  })

  beforeAll(async () => {
    await setupTestDb()
    ;({ user: student } = await approvalSeed.studentWithProfile())
    ;({ user: otherStudent } = await approvalSeed.studentWithProfile())
    plainStudent = await seed.student()
    rev1 = await approvalSeed.gymkhana("Club")
    rev2 = await approvalSeed.gymkhana("President Gymkhana")
    adminPlain = await seed.admin()
    saAdmin = await approvalSeed.adminWithSubRole("Student Affairs")
    officerSa = await approvalSeed.adminWithSubRole("Officer SA")
    assocDeanSa = await approvalSeed.adminWithSubRole("Associate Dean SA")
    deanSa = await approvalSeed.adminWithSubRole("Dean SA")
    wardenUser = await seed.warden()

    const api = await as(adminPlain)
    const created = await api.post(`${BASE}/categories`).send({
      name: "Cultural Secretary POR",
      // Step labels MUST be valid ApprovalLog.stage enum values ("Student",
      // "Club", "GS Gymkhana", "President Gymkhana", "Student Affairs",
      // "Officer SA", "Associate Dean SA", "Dean SA") — every approval writes
      // an ApprovalLog with the step label as its stage. Custom labels pass
      // category validation but blow up at approval time (see the SUSPECTED
      // BUG test below).
      gymkhanaSteps: [
        { label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] },
        { label: "President Gymkhana", reviewerUserIds: [String(rev2._id)] },
      ],
    })
    categoryId = created.body.data.category.id
  })

  const createRequest = async (asUser = student, overrides = {}) => {
    const api = await as(asUser)
    return api.post(BASE).send({ ...requestPayload(), porCategoryId: categoryId, ...overrides })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHZ / WORKSPACE
  // ═══════════════════════════════════════════════════════════════════════════
  describe("workspace & authz", () => {
    it("401 unauthenticated workspace", async () => {
      const api = await anon()
      const res = await api.get(`${BASE}/workspace`)
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })

    it("403 for Warden (not in guard roles)", async () => {
      const api = await as(wardenUser)
      const res = await api.get(`${BASE}/workspace`)
      expect(res.status).toBe(403)
    })

    it("student workspace shows student viewer mode and own (empty) requests", async () => {
      const api = await as(student)
      const res = await api.get(`${BASE}/workspace`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.viewer.mode).toBe("student")
      expect(res.body.data.viewer.canCreate).toBe(true)
      expect(Array.isArray(res.body.data.requests)).toBe(true)
      expect(res.body.data.porCategories.length).toBeGreaterThan(0)
    })

    it("plain admin workspace is supported=false with empty collections", async () => {
      const api = await as(adminPlain)
      const res = await api.get(`${BASE}/workspace`)
      expect(res.status).toBe(200)
      expect(res.body.data.viewer.mode).toBe("admin_other")
      expect(res.body.data.requests).toEqual([])
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CATEGORIES (Admin-managed)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("categories", () => {
    it("403 for non-Admin creation", async () => {
      const api = await as(student)
      const res = await api.post(`${BASE}/categories`).send({
        name: "Student Attempt",
        gymkhanaSteps: [{ label: "Step", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(res.status).toBe(403)
    })

    it("422 for missing name or empty steps", async () => {
      const api = await as(adminPlain)
      const noName = await api.post(`${BASE}/categories`).send({
        gymkhanaSteps: [{ label: "Step", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(noName.status).toBe(422)

      const noSteps = await api.post(`${BASE}/categories`).send({ name: "No Steps Category" })
      expect(noSteps.status).toBe(422)

      const stepNoReviewers = await api
        .post(`${BASE}/categories`)
        .send({ name: "Empty Step Category", gymkhanaSteps: [{ label: "Only Label" }] })
      expect(stepNoReviewers.status).toBe(422)
    })

    it("400 when a reviewer is not a Gymkhana user", async () => {
      const api = await as(adminPlain)
      const res = await api.post(`${BASE}/categories`).send({
        name: "Bad Reviewer Category",
        gymkhanaSteps: [{ label: "GS Gymkhana", reviewerUserIds: [String(student._id)] }],
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/active Gymkhana user/)
    })

    it("400 on duplicate category name (case-insensitive)", async () => {
      const api = await as(adminPlain)
      const res = await api.post(`${BASE}/categories`).send({
        name: "cultural secretary por",
        gymkhanaSteps: [{ label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/already exists/)
    })

    it("PUT updates a category; 404 unknown; duplicate name rejected", async () => {
      const api = await as(adminPlain)
      const created = await api.post(`${BASE}/categories`).send({
        name: "Sports Captain POR",
        gymkhanaSteps: [{ label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] }],
      })
      const id = created.body.data.category.id

      const renamed = await api.put(`${BASE}/categories/${id}`).send({
        name: "Sports Captain POR v2",
        gymkhanaSteps: [
          { label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] },
          { label: "President Gymkhana", reviewerUserIds: [String(rev2._id)] },
        ],
      })
      expect(renamed.status).toBe(200)
      expect(renamed.body.message).toBe("POR category updated successfully")
      expect(renamed.body.data.category.name).toBe("Sports Captain POR v2")
      expect(renamed.body.data.category.stepCount).toBe(2)

      const duplicate = await api.put(`${BASE}/categories/${id}`).send({
        name: "Cultural Secretary POR",
        gymkhanaSteps: [{ label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(duplicate.status).toBe(400)

      const missing = await api.put(`${BASE}/categories/000000000000000000000000`).send({
        name: "Ghost Category",
        gymkhanaSteps: [{ label: "GS Gymkhana", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(missing.status).toBe(404)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE REQUESTS (Student)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("create POR request", () => {
    it("403 for non-Student creators", async () => {
      const api = await as(adminPlain)
      const res = await api.post(BASE).send(requestPayload())
      expect(res.status).toBe(403)
    })

    it("422 when undertaking is not accepted or fields are too short", async () => {
      const api = await as(student)
      const noUndertaking = await api
        .post(BASE)
        .send({ ...requestPayload(), porCategoryId: categoryId, undertakingAccepted: false })
      expect(noUndertaking.status).toBe(422)

      const badDocRef = await api.post(BASE).send({
        ...requestPayload(),
        porCategoryId: categoryId,
        supportingDocumentUrl: "definitely-not-a-url",
      })
      expect(badDocRef.status).toBe(422)
    })

    it("404 when the caller has no StudentProfile", async () => {
      const api = await as(plainStudent)
      const res = await api.post(BASE).send({ ...requestPayload(), porCategoryId: categoryId })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/Student profile not found/)
    })

    it("404 for unknown porCategoryId", async () => {
      const api = await as(student)
      const res = await api
        .post(BASE)
        .send({ ...requestPayload(), porCategoryId: "000000000000000000000000" })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/POR category not found/)
    })

    it("201 creates a request routed to the first Gymkhana step", async () => {
      const res = await createRequest()
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.message).toBe("POR request submitted successfully")
      const request = res.body.data.request
      expect(request.status).toBe("pending_gymkhana")
      expect(request.currentApprovalStage).toBe("GS Gymkhana")
      expect(request.currentApproverUser.id).toBe(String(rev1._id))
      expect(request.porCategoryName).toBe("Cultural Secretary POR")
      expect(request.student.userId).toBe(String(student._id))
    })

    it("disciplinary action details are required when flagged", async () => {
      const api = await as(student)
      const res = await api.post(BASE).send({
        ...requestPayload(),
        porCategoryId: categoryId,
        hasDisciplinaryAction: true,
      })
      expect(res.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GYMKHANA REVIEW CHAIN
  // ═══════════════════════════════════════════════════════════════════════════
  describe("gymkhana review chain", () => {
    let requestId

    beforeAll(async () => {
      const res = await createRequest()
      requestId = res.body.data.request.id
    })

    it("403 when a non-assigned Gymkhana user tries to act", async () => {
      const outsider = await approvalSeed.gymkhana("Committee")
      const api = await as(outsider)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/assigned Gymkhana reviewers/)
    })

    it("422 for invalid action payloads", async () => {
      const api = await as(rev1)
      const badReject = await api.post(`${BASE}/${requestId}/reject`).send({ reason: "no" })
      expect(badReject.status).toBe(422)

      const badRevision = await api.post(`${BASE}/${requestId}/revision`).send({})
      expect(badRevision.status).toBe(422)
    })

    it("step 1 reviewer recommends -> routes to the President Gymkhana step", async () => {
      const api = await as(rev1)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({ comments: "Verified" })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("POR request recommended")
      expect(res.body.data.request.status).toBe("pending_gymkhana")
      expect(res.body.data.request.currentApprovalStage).toBe("President Gymkhana")
      // Raw doc response: the assignee id is stored as a plain string
      expect(String(res.body.data.request.currentApproverUser)).toBe(String(rev2._id))
    })

    it("final step reviewer recommends -> pending_student_affairs", async () => {
      const api = await as(rev2)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(200)
      expect(res.body.data.request.status).toBe("pending_student_affairs")
      expect(res.body.data.request.currentApprovalStage).toBe("Student Affairs")
    })

    it("SA forwarding requires a next recommender or direct approval", async () => {
      const api = await as(saAdmin)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Select at least one next recommender/)
    })

    it("SA forwards with an assigned Officer SA", async () => {
      const api = await as(saAdmin)
      const res = await api
        .post(`${BASE}/${requestId}/approve`)
        .send({
          comments: "Recommending",
          nextApprovers: [{ stage: "Officer SA", userId: String(officerSa._id) }],
        })
      expect(res.status).toBe(200)
      expect(res.body.data.request.status).toBe("pending_officer")
      // NOTE: the service stores the assignee as a raw string id, so the
      // serialized response does not hydrate currentApproverUser here; the
      // assignment is proven by the officer being able to act in the next test.
    })

    it("assigned Officer approves final step -> approved", async () => {
      const api = await as(officerSa)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(200)
      expect(res.body.message).toBe("POR request approved")
      expect(res.body.data.request.status).toBe("approved")
      expect(res.body.data.request.approvedAt).toBeTruthy()
    })

    it("acting on an already-approved request fails", async () => {
      const api = await as(deanSa)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/not pending approval|cannot approve/i)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTI-STAGE POST-SA CHAIN (explicit assignees for every stage)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("multi-stage post-SA chain", () => {
    let requestId

    beforeAll(async () => {
      const res = await createRequest()
      requestId = res.body.data.request.id
      // Walk the gymkhana steps
      await (await as(rev1)).post(`${BASE}/${requestId}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${requestId}/approve`).send({})
    })

    it("SA forwards through all three post-SA stages; each assignee acts in order", async () => {
      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/${requestId}/approve`)
        .send({
          nextApprovers: [
            { stage: "Officer SA", userId: String(officerSa._id) },
            { stage: "Associate Dean SA", userId: String(assocDeanSa._id) },
            { stage: "Dean SA", userId: String(deanSa._id) },
          ],
        })
      expect(forward.status).toBe(200)
      expect(forward.body.data.request.status).toBe("pending_officer")

      const apiOfficer = await as(officerSa)
      const step2 = await apiOfficer.post(`${BASE}/${requestId}/approve`).send({})
      expect(step2.status).toBe(200)
      expect(step2.body.data.request.status).toBe("pending_associate_dean")

      const apiAd = await as(assocDeanSa)
      const step3 = await apiAd.post(`${BASE}/${requestId}/approve`).send({})
      expect(step3.status).toBe(200)
      expect(step3.body.data.request.status).toBe("pending_dean")

      const apiDean = await as(deanSa)
      const final = await apiDean.post(`${BASE}/${requestId}/approve`).send({})
      expect(final.status).toBe(200)
      expect(final.body.data.request.status).toBe("approved")
    })

    it("out-of-order actor is rejected at each post-SA stage", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id
      await (await as(rev1)).post(`${BASE}/${id}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${id}/approve`).send({})
      await (await as(saAdmin))
        .post(`${BASE}/${id}/approve`)
        .send({
          nextApprovers: [{ stage: "Officer SA", userId: String(officerSa._id) }],
        })

      const apiDean = await as(deanSa)
      const early = await apiDean.post(`${BASE}/${id}/approve`).send({})
      expect(early.status).toBe(403)
      expect(early.body.message).toMatch(/Only Officer SA can/)
    })

    // SUSPECTED BUG: unlike the events module, the POR service REQUIRES
    // explicit assignees at every post-SA stage. Forwarding with
    // `nextApprovalStages` only (no `nextApprovers`) creates a chain with no
    // assignments, and the first post-SA reviewer is then permanently stuck:
    // their approval fails with 400 "Assigned approval flow is misconfigured".
    it("stages-only forwarding (no assignees) leaves the request stuck", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id
      await (await as(rev1)).post(`${BASE}/${id}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${id}/approve`).send({})

      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/${id}/approve`)
        .send({ nextApprovalStages: ["Officer SA"] })
      expect(forward.status).toBe(200)
      expect(forward.body.data.request.status).toBe("pending_officer")

      const apiOfficer = await as(officerSa)
      const stuck = await apiOfficer.post(`${BASE}/${id}/approve`).send({})
      expect(stuck.status).toBe(400)
      expect(stuck.body.message).toMatch(/Assigned approval flow is misconfigured/)
    })

    // SUSPECTED BUG: category step labels are free-form at creation time, but
    // every approval writes an ApprovalLog whose `stage` is the step label,
    // and ApprovalLog.stage only allows ["Student","Club","GS Gymkhana",
    // "President Gymkhana","Student Affairs","Officer SA","Associate Dean SA",
    // "Dean SA"]. Approving at a custom-labeled step therefore fails with 422
    // AFTER the state transition was already persisted — the request moves but
    // the API reports an error and no history entry is written.
    it("rejects custom step labels at category creation (they would corrupt approvals)", async () => {
      // Step labels become ApprovalLog.stage values, so only the enum stages
      // are accepted up front — previously the category was created fine and
      // every later approval failed 422 AFTER the request had already advanced.
      const apiAdmin = await as(adminPlain)
      const cat = await apiAdmin.post(`${BASE}/categories`).send({
        name: "Custom Label POR",
        gymkhanaSteps: [{ label: "Club Review", reviewerUserIds: [String(rev1._id)] }],
      })
      expect(cat.status).toBeGreaterThanOrEqual(400)
      expect(JSON.stringify(cat.body)).toMatch(/valid approval stage|Club Review/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECT APPROVAL FROM STUDENT AFFAIRS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("direct approval from SA", () => {
    it("directApprove conflicts with selected next approvers", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id
      await (await as(rev1)).post(`${BASE}/${id}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${id}/approve`).send({})

      const api = await as(saAdmin)
      const conflict = await api
        .post(`${BASE}/${id}/approve`)
        .send({
          directApprove: true,
          nextApprovalStages: ["Officer SA"],
        })
      expect(conflict.status).toBe(400)
      expect(conflict.body.message).toMatch(/only allowed when no next recommender/)
    })

    it("directApprove alone approves immediately", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id
      await (await as(rev1)).post(`${BASE}/${id}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${id}/approve`).send({})

      const api = await as(saAdmin)
      const approved = await api.post(`${BASE}/${id}/approve`).send({ directApprove: true })
      expect(approved.status).toBe(200)
      expect(approved.body.data.request.status).toBe("approved")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // REJECT & REVISION WORKFLOWS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("reject & revision workflows", () => {
    it("rejection records reason; student cannot edit a rejected request", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id

      const apiRev = await as(rev1)
      const rejected = await apiRev
        .post(`${BASE}/${id}/reject`)
        .send({ reason: "Position could not be verified with the club" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.data.request.status).toBe("rejected")
      expect(rejected.body.data.request.rejectionReason).toMatch(/could not be verified/)
      expect(String(rejected.body.data.request.rejectedBy)).toBe(String(rev1._id))

      const apiStudent = await as(student)
      const editRejected = await apiStudent
        .put(`${BASE}/${id}`)
        .send({ ...requestPayload(), porCategoryId: categoryId })
      expect(editRejected.status).toBe(400)
      expect(editRejected.body.message).toMatch(/needing modification/)
    })

    it("revision request lets the owning student resubmit", async () => {
      const res = await createRequest()
      const id = res.body.data.request.id

      const apiRev = await as(rev1)
      const revision = await apiRev
        .post(`${BASE}/${id}/revision`)
        .send({ comments: "Please attach the appointment letter" })
      expect(revision.status).toBe(200)
      expect(revision.body.data.request.status).toBe("revision_requested")

      // Another student cannot edit someone else's request
      const apiOther = await as(otherStudent)
      const forbiddenEdit = await apiOther
        .put(`${BASE}/${id}`)
        .send({ ...requestPayload(), porCategoryId: categoryId })
      expect(forbiddenEdit.status).toBe(403)
      expect(forbiddenEdit.body.message).toMatch(/only update your own/)

      // Owner resubmits
      const apiStudent = await as(student)
      const resubmitted = await apiStudent
        .put(`${BASE}/${id}`)
        .send({
          ...requestPayload(),
          porCategoryId: categoryId,
          supportingDocumentUrl: "https://files.example.com/new-letter.pdf",
        })
      expect(resubmitted.status).toBe(200)
      expect(resubmitted.body.message).toBe("POR request resubmitted successfully")
      expect(resubmitted.body.data.request.status).toBe("pending_gymkhana")
      expect(resubmitted.body.data.request.currentApprovalStage).toBe("GS Gymkhana")
      expect(resubmitted.body.data.request.revisionCount).toBe(1)
      expect(resubmitted.body.data.request.supportingDocumentUrl).toBe(
        "https://files.example.com/new-letter.pdf"
      )

      // Editing while pending review is blocked
      const editPending = await apiStudent
        .put(`${BASE}/${id}`)
        .send({ ...requestPayload(), porCategoryId: categoryId })
      expect(editPending.status).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HISTORY, CERTIFICATE, PER-STUDENT LISTING
  // ═══════════════════════════════════════════════════════════════════════════
  describe("history, certificate & listings", () => {
    let approvedRequestId

    beforeAll(async () => {
      const res = await createRequest()
      approvedRequestId = res.body.data.request.id
      await (await as(rev1)).post(`${BASE}/${approvedRequestId}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${approvedRequestId}/approve`).send({})
      await (await as(saAdmin))
        .post(`${BASE}/${approvedRequestId}/approve`)
        .send({ directApprove: true })
    })

    it("history is visible to the owner and records every action", async () => {
      const api = await as(student)
      const res = await api.get(`${BASE}/${approvedRequestId}/history`)
      expect(res.status).toBe(200)
      const actions = res.body.data.history.map((h) => h.action)
      expect(actions).toEqual(expect.arrayContaining(["submitted", "recommended", "approved"]))
    })

    it("history is forbidden for unrelated students", async () => {
      const api = await as(otherStudent)
      const res = await api.get(`${BASE}/${approvedRequestId}/history`)
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/cannot view this POR request/)
    })

    it("certificate is blocked before approval and available after", async () => {
      const pendingRes = await createRequest()
      const pendingId = pendingRes.body.data.request.id

      const api = await as(student)
      const blocked = await api.get(`${BASE}/${pendingId}/certificate`)
      expect(blocked.status).toBe(400)
      expect(blocked.body.message).toMatch(/approved POR requests/)

      const ok = await api.get(`${BASE}/${approvedRequestId}/certificate`)
      expect(ok.status).toBe(200)
      expect(ok.body.data.request.status).toBe("approved")
      expect(ok.body.data.request.positionTitle).toBe("Cultural Secretary")
      expect(ok.body.data.data.name).toBeTruthy()
      expect(ok.body.data.data.rollNumber).toBeTruthy()
    })

    it("GET /student/:userId lists a student's requests for SA admins; students are forbidden", async () => {
      // NOTE: only supported viewer modes (Gymkhana / Student Affairs /
      // post-SA admins) can list; a plain Admin (mode "admin_other",
      // supported=false) is also rejected with 403.
      const apiSa = await as(saAdmin)
      const ok = await apiSa.get(`${BASE}/student/${String(student._id)}`)
      expect(ok.status).toBe(200)
      expect(
        ok.body.data.requests.some((r) => r.id === String(approvedRequestId))
      ).toBe(true)

      const apiPlainAdmin = await as(adminPlain)
      const plainDenied = await apiPlainAdmin.get(`${BASE}/student/${String(student._id)}`)
      expect(plainDenied.status).toBe(403)

      const apiStudent = await as(student)
      const denied = await apiStudent.get(`${BASE}/student/${String(student._id)}`)
      expect(denied.status).toBe(403)
      // Blocked by the route's role gate before the service-level message
      expect(denied.body.message).toMatch(/Required role: Gymkhana or Admin/)

      const badParam = await apiSa.get(`${BASE}/student/not-an-id`)
      expect(badParam.status).toBe(422)
    })

    it("SA workspace surfaces stats and post-SA approver options", async () => {
      const api = await as(saAdmin)
      const res = await api.get(`${BASE}/workspace`)
      expect(res.status).toBe(200)
      expect(res.body.data.viewer.mode).toBe("student_affairs")
      expect(res.body.data.viewer.showStats).toBe(true)
      expect(res.body.data.approversByStage["Officer SA"].length).toBeGreaterThan(0)
      expect(res.body.data.requests.length).toBeGreaterThan(0)
    })

    it("404 for unknown request ids on action/history/certificate routes", async () => {
      const api = await as(saAdmin)
      const ghost = "000000000000000000000000"

      const approve = await api.post(`${BASE}/${ghost}/approve`).send({ directApprove: true })
      expect(approve.status).toBe(404)

      const history = await api.get(`${BASE}/${ghost}/history`)
      expect(history.status).toBe(404)

      const certificate = await api.get(`${BASE}/${ghost}/certificate`)
      expect(certificate.status).toBe(404)

      const badId = await api.get(`${BASE}/xyz/history`)
      expect(badId.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: SUBMISSION VALIDATION EDGE CASES (one field at a time)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: submission validation edges", () => {
    it("422 for a malformed (non-objectid) porCategoryId", async () => {
      const api = await as(student)
      const res = await api.post(BASE).send({ ...requestPayload(), porCategoryId: "not-an-id" })
      expect(res.status).toBe(422)
      expect(res.body.errors[0].field).toBe("porCategoryId")
    })

    it("422 when undertakingAccepted is absent entirely", async () => {
      const api = await as(student)
      const { undertakingAccepted, ...noUndertaking } = requestPayload()
      const res = await api.post(BASE).send({ ...noUndertaking, porCategoryId: categoryId })
      expect(res.status).toBe(422)
      expect(res.body.errors[0].field).toBe("undertakingAccepted")
    })

    it("422 for positionDetails shorter than 5 chars", async () => {
      const api = await as(student)
      const res = await api.post(BASE).send({
        ...requestPayload(),
        porCategoryId: categoryId,
        positionDetails: "tiny",
      })
      expect(res.status).toBe(422)
      expect(res.body.errors[0].field).toBe("positionDetails")
    })

    it("201 accepts a disciplinary declaration with sufficient details", async () => {
      const res = await createRequest(student, {
        hasDisciplinaryAction: true,
        disciplinaryActionDetails: "Served a one-week conduct probation in 2024.",
      })
      expect(res.status).toBe(201)
      expect(res.body.data.request.status).toBe("pending_gymkhana")
      expect(res.body.data.request.hasDisciplinaryAction).toBe(true)

      // Prove persistence via a follow-up listing scoped to the student
      const listRes = await (await as(saAdmin)).get(`${BASE}/student/${String(student._id)}`)
      expect(
        listRes.body.data.requests.some((r) => r.id === res.body.data.request.id)
      ).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: WRONG-REVIEWER ATTEMPTS AT EVERY STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: wrong-reviewer attempts at every stage", () => {
    let requestId

    beforeAll(async () => {
      const res = await createRequest()
      requestId = res.body.data.request.id
    })

    it("step-2 reviewer cannot act while the request sits at step 1", async () => {
      const api = await as(rev2)
      const approveAttempt = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(approveAttempt.status).toBe(403)
      expect(approveAttempt.body.message).toMatch(
        /Only the assigned Gymkhana reviewers can act on this POR request/
      )

      const rejectAttempt = await api.post(`${BASE}/${requestId}/reject`).send({
        reason: "Step two reviewer jumping the queue",
      })
      expect(rejectAttempt.status).toBe(403)

      const revisionAttempt = await api
        .post(`${BASE}/${requestId}/revision`)
        .send({ comments: "Out of order revision demand" })
      expect(revisionAttempt.status).toBe(403)
    })

    it("an unrelated student is stopped by the route role gate (not service scope)", async () => {
      const api = await as(otherStudent)
      const res = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(res.status).toBe(403)
      // The approve route only admits Gymkhana/Admin roles, so students are
      // rejected by RBAC before any ownership check runs.
      expect(res.body.message).toMatch(/Required role: Gymkhana or Admin/)
    })

    it("the step-1 reviewer is locked out once the request moves to step 2", async () => {
      const moved = await (await as(rev1)).post(`${BASE}/${requestId}/approve`).send({})
      expect(moved.status).toBe(200)
      expect(moved.body.data.request.currentApprovalStage).toBe("President Gymkhana")

      const api = await as(rev1)
      const repeatApprove = await api.post(`${BASE}/${requestId}/approve`).send({})
      expect(repeatApprove.status).toBe(403)
      expect(repeatApprove.body.message).toMatch(/Only the assigned Gymkhana reviewers/)

      const repeatRevision = await api
        .post(`${BASE}/${requestId}/revision`)
        .send({ comments: "Trying to revision after recommending" })
      expect(repeatRevision.status).toBe(403)
    })

    it("post-SA admins with valid roles are blocked at the Student Affairs stage", async () => {
      const toSa = await (await as(rev2)).post(`${BASE}/${requestId}/approve`).send({})
      expect(toSa.status).toBe(200)
      expect(toSa.body.data.request.status).toBe("pending_student_affairs")

      const apiOfficer = await as(officerSa)
      const attempt = await apiOfficer.post(`${BASE}/${requestId}/approve`).send({})
      expect(attempt.status).toBe(403)
      expect(attempt.body.message).toMatch(/Only Office - Student Affairs can review this POR request/)
    })

    it("at pending_officer only Officer SA may act — SA office and later stages included", async () => {
      const forward = await (await as(saAdmin))
        .post(`${BASE}/${requestId}/approve`)
        .send({ nextApprovers: [{ stage: "Officer SA", userId: String(officerSa._id) }] })
      expect(forward.status).toBe(200)
      expect(forward.body.data.request.status).toBe("pending_officer")

      // The forwarding SA admin itself is now out of order
      const saApprove = await (await as(saAdmin)).post(`${BASE}/${requestId}/approve`).send({})
      expect(saApprove.status).toBe(403)
      expect(saApprove.body.message).toMatch(/Only Officer SA can review this POR request/)

      const saReject = await (await as(saAdmin))
        .post(`${BASE}/${requestId}/reject`)
        .send({ reason: "SA office cannot reject at the officer stage" })
      expect(saReject.status).toBe(403)

      const assocAttempt = await (await as(assocDeanSa))
        .post(`${BASE}/${requestId}/revision`)
        .send({ comments: "Associate Dean acting before their stage" })
      expect(assocAttempt.status).toBe(403)
      expect(assocAttempt.body.message).toMatch(/Only Officer SA can review this POR request/)

      const deanAttempt = await (await as(deanSa))
        .post(`${BASE}/${requestId}/reject`)
        .send({ reason: "Dean rejecting at the officer stage" })
      expect(deanAttempt.status).toBe(403)
    })

    it("finalized requests refuse further actions with the fallback message", async () => {
      const final = await (await as(officerSa)).post(`${BASE}/${requestId}/approve`).send({})
      expect(final.status).toBe(200)
      expect(final.body.data.request.status).toBe("approved")

      const apiDean = await as(deanSa)
      const doubleApprove = await apiDean.post(`${BASE}/${requestId}/approve`).send({})
      expect(doubleApprove.status).toBe(403)
      expect(doubleApprove.body.message).toMatch(/POR request is not pending approval/)

      const lateReject = await apiDean
        .post(`${BASE}/${requestId}/reject`)
        .send({ reason: "Rejecting an already approved POR must fail" })
      expect(lateReject.status).toBe(403)
      expect(lateReject.body.message).toMatch(/POR request is not pending approval/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: REJECTED REQUESTS ARE TERMINAL FOR APPROVERS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: rejected requests are terminal", () => {
    let rejectedId

    beforeAll(async () => {
      const res = await createRequest()
      rejectedId = res.body.data.request.id
      const rejected = await (await as(rev1))
        .post(`${BASE}/${rejectedId}/reject`)
        .send({ reason: "Verification documents did not match club records" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.data.request.status).toBe("rejected")
    })

    it("approvers cannot approve, reject or request revision on a rejected request", async () => {
      const apiRev1 = await as(rev1)
      const reApprove = await apiRev1.post(`${BASE}/${rejectedId}/approve`).send({})
      expect(reApprove.status).toBe(403)
      expect(reApprove.body.message).toMatch(/POR request is not pending approval/)

      const reReject = await apiRev1
        .post(`${BASE}/${rejectedId}/reject`)
        .send({ reason: "Second rejection of a rejected request" })
      expect(reReject.status).toBe(403)

      const apiSa = await as(saAdmin)
      const directApprove = await apiSa.post(`${BASE}/${rejectedId}/approve`).send({
        directApprove: true,
      })
      expect(directApprove.status).toBe(403)
      expect(directApprove.body.message).toMatch(/POR request is not pending approval/)

      const revision = await apiSa
        .post(`${BASE}/${rejectedId}/revision`)
        .send({ comments: "Trying to reopen a rejected request" })
      expect(revision.status).toBe(403)
    })

    it("the rejection stays recorded after all failed attempts", async () => {
      const apiStudent = await as(student)
      const history = await apiStudent.get(`${BASE}/${rejectedId}/history`)
      expect(history.status).toBe(200)
      expect(history.body.data.history.map((h) => h.action)).toContain("rejected")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: CERTIFICATE SCOPE + STORAGE-INDEPENDENT GENERATION
  //
  // The certificate endpoint resolves template/logo/signature media refs but
  // never touches the student's supportingDocumentUrl — an unreachable host in
  // that field does not block generation.
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: certificate scope & unreachable storage refs", () => {
    let certRequestId

    beforeAll(async () => {
      const res = await createRequest(student, {
        supportingDocumentUrl: "https://storage.unreachable.invalid/por-proof.pdf",
      })
      certRequestId = res.body.data.request.id
      expect(res.body.data.request.supportingDocumentUrl).toBe(
        "https://storage.unreachable.invalid/por-proof.pdf"
      )
      await (await as(rev1)).post(`${BASE}/${certRequestId}/approve`).send({})
      await (await as(rev2)).post(`${BASE}/${certRequestId}/approve`).send({})
      await (await as(saAdmin))
        .post(`${BASE}/${certRequestId}/approve`)
        .send({ directApprove: true })
    })

    it("another student cannot generate someone else's certificate", async () => {
      const api = await as(otherStudent)
      const res = await api.get(`${BASE}/${certRequestId}/certificate`)
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/You cannot generate a certificate for this POR request/)
    })

    it("owner gets full certificate data despite the unreachable document ref", async () => {
      const api = await as(student)
      const res = await api.get(`${BASE}/${certRequestId}/certificate`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(String(res.body.data.request.id)).toBe(String(certRequestId))
      expect(res.body.data.request.positionTitle).toBe("Cultural Secretary")
      // Full payload shape: template + resolved variables + signatures
      expect(res.body.data.template).toBeTruthy()
      expect(typeof res.body.data.template.body).toBe("string")
      expect(Array.isArray(res.body.data.signatures)).toBe(true)
      expect(res.body.data.data.name).toBeTruthy()
      expect(res.body.data.data.rollNumber).toBeTruthy()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: WORKSPACE SCOPING BETWEEN STUDENTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: student workspace scoping", () => {
    it("a student's workspace lists only their own requests", async () => {
      const apiOther = await as(otherStudent)
      const otherView = await apiOther.get(`${BASE}/workspace`)
      expect(otherView.status).toBe(200)
      expect(otherView.body.data.viewer.mode).toBe("student")
      // Every listed request belongs to the viewing student, not to `student`
      expect(
        otherView.body.data.requests.every(
          (r) => !r.student || String(r.student.userId) === String(otherStudent._id)
        )
      ).toBe(true)
    })
  })
})
