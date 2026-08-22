import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { approvalSeed as saFixtures } from "../../helpers/seed/approval-fixtures.js"

/**
 * Integration tests for /api/v1/student-affairs/events.
 *
 * NOTE on envelopes: this module's controllers use `sendRawResponse`, so
 * SUCCESS responses are the bare data payload (e.g. `{ calendar }`) and
 * service failures return `{ message }` (no `success` flag). Validation
 * failures go through the global handler as 422 `{ success:false, errors }`.
 */

const BASE = "/api/v1/student-affairs/events"

const daysFromNow = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

const calEvent = (title, extra = {}) => ({
  title,
  category: "technical",
  startDate: daysFromNow(30),
  endDate: daysFromNow(31),
  estimatedBudget: 5000,
  description: `${title} description for integration tests`,
  ...extra,
})

const proposalDetails = () => ({
  programmeTitle: "Annual Tech Fest Programme",
  organisingUnit: {
    unitType: "Student Body",
    coordinatorNames: "John Coordinator",
    contactEmail: "coordinator@example.com",
    contactMobile: "9999999999",
  },
  backgroundAndRationale: {
    contextRelevance: "The event is highly relevant to the institute context.",
    expectedImpact: "It will positively impact students across departments.",
    alignmentWithObjectives: "Aligned with the gymkhana annual objectives.",
  },
  objectives: { objective1: "Bring students together" },
  programmeDetails: {
    programmeType: "Technical",
    mode: "Offline",
    datesAndDuration: "Two days on campus",
    venue: "Main Auditorium",
    expectedParticipants: 200,
  },
  programmeSchedule: { brief: "Day 1 workshops and Day 2 competitions planned." },
  sourceOfFunds: { gymkhanaFund: 1000 },
})

const proposalPayload = () => ({
  proposalText: "We propose to conduct the annual technical fest on campus.",
  proposalDetails: proposalDetails(),
  totalExpectedIncome: 0,
  totalExpenditure: 1000,
})

const expensePayload = () => ({
  bills: [
    {
      description: "Venue decoration",
      amount: 800,
      attachments: [{ filename: "bill1.pdf", url: "https://files.hms.test/bill1.pdf" }],
    },
  ],
  eventReportDocumentUrl: "https://files.hms.test/report.pdf",
  notes: "Post-event expense submission",
})

describe("student-affairs /events", () => {
  let admin // Admin without subrole
  let saAdmin // Admin subRole "Student Affairs"
  let officerSa // Admin subRole "Officer SA"
  let assocDeanSa // Admin subRole "Associate Dean SA"
  let deanSa // Admin subRole "Dean SA"
  let gs // Gymkhana subRole "GS Gymkhana"
  let president // Gymkhana subRole "President Gymkhana"
  let studentUser
  let wardenUser

  // Shared workflow state across describes (calendar -> proposals -> expenses)
  let calendarId
  let eventId
  let calendar2Id
  let calendar2EventId

  beforeAll(async () => {
    await setupTestDb()
    admin = await seed.admin()
    saAdmin = await saFixtures.adminWithSubRole("Student Affairs")
    officerSa = await saFixtures.adminWithSubRole("Officer SA")
    assocDeanSa = await saFixtures.adminWithSubRole("Associate Dean SA")
    deanSa = await saFixtures.adminWithSubRole("Dean SA")
    gs = await saFixtures.gymkhana("GS Gymkhana")
    president = await saFixtures.gymkhana("President Gymkhana")
    studentUser = await seed.student()
    wardenUser = await seed.warden()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIVITY CALENDAR
  // ═══════════════════════════════════════════════════════════════════════════
  describe("activity calendar", () => {
    it("401 for unauthenticated create", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/calendar`).send({ academicYear: "2025-26" })
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })

    it("403 for non-admin create (role gate)", async () => {
      const api = await as(studentUser)
      const res = await api.post(`${BASE}/calendar`).send({ academicYear: "2025-26" })
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    })

    it("422 for invalid academicYear format", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar`).send({ academicYear: "2025" })
      expect(res.status).toBe(422)
      expect(res.body.success).toBe(false)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it("201 admin creates a draft calendar with events (bare data envelope)", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/calendar`)
        .send({
          academicYear: "2025-26",
          events: [calEvent("Tech Symposium"), calEvent("Cultural Night", { category: "cultural" })],
          overallBudget: 20000,
        })
      expect(res.status).toBe(201)
      expect(res.body.calendar).toBeTruthy()
      expect(res.body.calendar.academicYear).toBe("2025-26")
      expect(res.body.calendar.status).toBe("draft")
      expect(res.body.calendar.isLocked).toBe(false)
      expect(res.body.calendar.events).toHaveLength(2)
      expect(res.body.calendar.overallBudget).toBe(20000)
      calendarId = res.body.calendar._id
      eventId = res.body.calendar.events[0]._id
    })

    it("400 on duplicate academic year", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar`).send({ academicYear: "2025-26" })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/already exists/)
    })

    // SUSPECTED BUG (documented behavior): unknown event categories are not
    // rejected — getGlobalGymkhanaCategoryDefinitions auto-discovers categories
    // from the submitted events, so "intergalactic" passes create-time
    // validation (and is persisted on the event) even though it is not part of
    // the calendar's stored categoryDefinitions.
    it("unknown categories are accepted rather than rejected", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/calendar`)
        .send({
          academicYear: "2026-27",
          events: [calEvent("Bad Category Event", { category: "intergalactic" })],
        })
      expect(res.status).toBe(201)
      expect(res.body.calendar.events[0].category).toBe("intergalactic")
      const keys = res.body.calendar.categoryDefinitions.map((c) => c.key)
      expect(keys).not.toContain("intergalactic")
    })

    it("GET /calendar lists calendars paginated", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/calendar`).query({ academicYear: "2025-26" })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.items)).toBe(true)
      expect(res.body.items[0].academicYear).toBe("2025-26")
      expect(res.body.pagination.total).toBeGreaterThanOrEqual(1)
    })

    it("GET /calendar/years returns academic years", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/calendar/years`)
      expect(res.status).toBe(200)
      expect(res.body.years.some((y) => y.academicYear === "2025-26")).toBe(true)
    })

    it("GET /calendar/year/:year returns by year and 404 when missing", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/calendar/year/2025-26`)
      expect(ok.status).toBe(200)
      expect(ok.body.calendar._id).toBe(calendarId)

      const missing = await api.get(`${BASE}/calendar/year/1999-00`)
      expect(missing.status).toBe(404)
    })

    it("GET /calendar/:id returns populated calendar; 404 unknown; 422 bad id", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/calendar/${calendarId}`)
      expect(ok.status).toBe(200)
      expect(ok.body.calendar.events).toHaveLength(2)

      const missing = await api.get(`${BASE}/calendar/000000000000000000000000`)
      expect(missing.status).toBe(404)

      const bad = await api.get(`${BASE}/calendar/not-an-id`)
      // No params validation on this route -> mongoose CastError -> 400
      expect(bad.status).toBe(400)
    })

    it("PUT /calendar/:id is Gymkhana-only; GS edits reset status to draft", async () => {
      const apiAdmin = await as(admin)
      const forbidden = await apiAdmin.put(`${BASE}/calendar/${calendarId}`).send({
        events: [calEvent("Nope")],
      })
      expect(forbidden.status).toBe(403)

      const apiGs = await as(gs)
      const current = await apiGs.get(`${BASE}/calendar/${calendarId}`)
      const events = current.body.calendar.events.map((e) => ({ ...e }))
      events[0].title = "Tech Symposium Renamed"

      const res = await apiGs.put(`${BASE}/calendar/${calendarId}`).send({ events })
      expect(res.status).toBe(200)
      expect(res.body.calendar.events[0].title).toBe("Tech Symposium Renamed")

      const verify = await apiGs.get(`${BASE}/calendar/${calendarId}`)
      expect(verify.body.calendar.events[0].title).toBe("Tech Symposium Renamed")
    })

    it("PATCH settings is admin-only and updates allowProposalBeforeApproval", async () => {
      const apiGs = await as(gs)
      const denied = await apiGs.patch(`${BASE}/calendar/${calendarId}/settings`).send({
        allowProposalBeforeApproval: true,
      })
      expect(denied.status).toBe(403)

      const api = await as(admin)
      const res = await api.patch(`${BASE}/calendar/${calendarId}/settings`).send({
        allowProposalBeforeApproval: true,
      })
      expect(res.status).toBe(200)
      expect(res.body.calendar.allowProposalBeforeApproval).toBe(true)
    })

    it("POST check-overlap reports overlapping candidate ranges", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar/${calendarId}/check-overlap`).send({
        startDate: daysFromNow(30),
        endDate: daysFromNow(32),
      })
      expect(res.status).toBe(200)
      expect(res.body.hasOverlap).toBe(true)
      expect(res.body.overlapSummary.hasOverlaps).toBe(true)
    })

    it("submit is President-only; GS gets 403", async () => {
      const apiGs = await as(gs)
      const res = await apiGs.post(`${BASE}/calendar/${calendarId}/submit`).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/President/)
    })

    it("submit flags overlapping dates and requires confirmation first", async () => {
      const api = await as(president)
      // The two calendar events share the same date range -> overlap detected
      const res = await api.post(`${BASE}/calendar/${calendarId}/submit`).send({})
      expect(res.status).toBe(200)
      expect(res.body.requiresOverlapConfirmation).toBe(true)
      expect(res.body.overlapSummary.hasOverlaps).toBe(true)
    })

    it("President submits calendar -> pending_student_affairs + locked", async () => {
      const api = await as(president)
      const res = await api
        .post(`${BASE}/calendar/${calendarId}/submit`)
        .send({ allowOverlappingDates: true })
      expect(res.status).toBe(200)
      expect(res.body.calendar.status).toBe("pending_student_affairs")
      expect(res.body.calendar.isLocked).toBe(true)
      expect(res.body.calendar.currentApprovalStage).toBe("Student Affairs")
    })

    it("locked calendar cannot be edited or submitted again", async () => {
      const api = await as(president)
      const edit = await api.put(`${BASE}/calendar/${calendarId}`).send({
        events: [calEvent("Should Fail")],
      })
      expect(edit.status).toBe(403)
      expect(edit.body.message).toMatch(/locked/i)
    })

    it("out-of-order approval is forbidden (Officer cannot act at SA stage)", async () => {
      const api = await as(officerSa)
      const res = await api.post(`${BASE}/calendar/${calendarId}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only Student Affairs can approve/)
    })

    it("SA must select a next recommender before forwarding", async () => {
      const api = await as(saAdmin)
      const res = await api.post(`${BASE}/calendar/${calendarId}/approve`).send({})
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Select at least one next recommender/)
    })

    it("full approval chain SA -> Officer -> Associate Dean -> Dean", async () => {
      const apiSa = await as(saAdmin)
      const step1 = await apiSa
        .post(`${BASE}/calendar/${calendarId}/approve`)
        .send({
          comments: "ok",
          nextApprovalStages: ["Officer SA", "Associate Dean SA", "Dean SA"],
        })
      expect(step1.status).toBe(200)
      expect(step1.body.calendar.status).toBe("pending_officer")

      const apiOfficer = await as(officerSa)
      const step2 = await apiOfficer.post(`${BASE}/calendar/${calendarId}/approve`).send({})
      expect(step2.status).toBe(200)
      expect(step2.body.calendar.status).toBe("pending_associate_dean")

      const apiAd = await as(assocDeanSa)
      const step3 = await apiAd.post(`${BASE}/calendar/${calendarId}/approve`).send({})
      expect(step3.status).toBe(200)
      expect(step3.body.calendar.status).toBe("pending_dean")

      const apiDean = await as(deanSa)
      const step4 = await apiDean.post(`${BASE}/calendar/${calendarId}/approve`).send({})
      expect(step4.status).toBe(200)
      expect(step4.body.calendar.status).toBe("approved")
      expect(step4.body.calendar.isLocked).toBe(true)
    })

    it("approval history records every stage action", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/calendar/${calendarId}/history`)
      expect(res.status).toBe(200)
      const stages = res.body.history.map((h) => h.stage)
      expect(stages).toEqual(
        expect.arrayContaining([
          "President Gymkhana",
          "Student Affairs",
          "Officer SA",
          "Associate Dean SA",
          "Dean SA",
        ])
      )
    })

    it("lock/unlock lifecycle with conflict guards", async () => {
      const api = await as(admin)
      const alreadyLocked = await api.post(`${BASE}/calendar/${calendarId}/lock`).send({})
      expect(alreadyLocked.status).toBe(400)

      const unlock = await api.post(`${BASE}/calendar/${calendarId}/unlock`).send({})
      expect(unlock.status).toBe(200)
      expect(unlock.body.calendar.isLocked).toBe(false)

      const lockAgain = await api.post(`${BASE}/calendar/${calendarId}/lock`).send({})
      expect(lockAgain.status).toBe(200)
      expect(lockAgain.body.calendar.isLocked).toBe(true)
    })

    it("reject path: SA rejects a submitted calendar; President edits & resubmits", async () => {
      const apiAdmin = await as(admin)
      const created = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2027-28", events: [calEvent("Future Fest")] })
      expect(created.status).toBe(201)
      calendar2Id = created.body.calendar._id
      calendar2EventId = created.body.calendar.events[0]._id

      const apiPrez = await as(president)
      const submitted = await apiPrez.post(`${BASE}/calendar/${calendar2Id}/submit`).send({})
      expect(submitted.status).toBe(200)

      const apiStudent = await as(studentUser)
      const denied = await apiStudent
        .post(`${BASE}/calendar/${calendar2Id}/reject`)
        .send({ reason: "not allowed to reject" })
      expect(denied.status).toBe(403)

      const apiSa = await as(saAdmin)
      const shortReason = await apiSa
        .post(`${BASE}/calendar/${calendar2Id}/reject`)
        .send({ reason: "short" })
      expect(shortReason.status).toBe(422)

      const rejected = await apiSa
        .post(`${BASE}/calendar/${calendar2Id}/reject`)
        .send({ reason: "Budget breakdown is missing for the cultural night" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.calendar.status).toBe("rejected")

      // SUSPECTED BUG (documented behavior): rejection leaves the calendar
      // locked, so the President cannot edit it until an Admin unlocks it —
      // even though the rejection notification asks them to revise & resubmit.
      const stillLocked = await apiPrez.put(`${BASE}/calendar/${calendar2Id}`).send({
        events: [calEvent("Blocked Edit")],
      })
      expect(stillLocked.status).toBe(403)
      expect(stillLocked.body.message).toMatch(/locked/i)

      const apiAdmin2 = await as(admin)
      const unlocked = await apiAdmin2.post(`${BASE}/calendar/${calendar2Id}/unlock`).send({})
      expect(unlocked.status).toBe(200)

      // President edits the rejected calendar -> back to draft, then resubmits
      const current = await apiPrez.get(`${BASE}/calendar/${calendar2Id}`)
      const events = current.body.calendar.events.map((e) => ({ ...e, estimatedBudget: 6000 }))
      const edited = await apiPrez.put(`${BASE}/calendar/${calendar2Id}`).send({ events })
      expect(edited.status).toBe(200)
      expect(edited.body.calendar.status).toBe("draft")

      const resubmitted = await apiPrez.post(`${BASE}/calendar/${calendar2Id}/submit`).send({})
      expect(resubmitted.status).toBe(200)
      expect(resubmitted.body.calendar.status).toBe("pending_student_affairs")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT PROPOSALS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("event proposals", () => {
    let proposalId
    let revisionProposalId
    let rejectProposalId

    it("401 unauthenticated proposal submission", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/events/000000000000000000000000/proposal`).send({})
      expect(res.status).toBe(401)
    })

    it("403 for non-Gymkhana roles (route role gate)", async () => {
      const api = await as(wardenUser)
      const res = await api
        .post(`${BASE}/events/000000000000000000000000/proposal`)
        .send(proposalPayload())
      expect(res.status).toBe(403)
      expect(res.body.success).toBe(false)
    })

    it("403 President cannot submit proposals for standard events", async () => {
      const api = await as(president)
      const res = await api.post(`${BASE}/events/${eventId}/proposal`).send(proposalPayload())
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only GS Gymkhana/)
    })

    it("422 when proposal payload is invalid", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${eventId}/proposal`).send({ proposalText: "hi" })
      expect(res.status).toBe(422)
      expect(res.body.errors.length).toBeGreaterThan(0)
    })

    it("201 GS submits proposal -> pending_president; event flips to proposal_submitted", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${eventId}/proposal`).send(proposalPayload())
      expect(res.status).toBe(201)
      expect(res.body.proposal).toBeTruthy()
      expect(res.body.proposal.status).toBe("pending_president")
      expect(String(res.body.proposal.eventId)).toBe(String(eventId))
      proposalId = res.body.proposal._id

      const eventRes = await (await as(admin)).get(`${BASE}/${eventId}`)
      expect(eventRes.body.event.status).toBe("proposal_submitted")
      expect(eventRes.body.event.proposalSubmitted).toBe(true)
    })

    it("400 duplicate proposal for the same event", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${eventId}/proposal`).send(proposalPayload())
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/already submitted/)
    })

    it("GS cannot update while pending_president (only after revision/rejection)", async () => {
      const api = await as(gs)
      const res = await api.put(`${BASE}/proposals/${proposalId}`).send({ proposalText: "Updated text." })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/revision request or rejection/)
    })

    it("GET /proposals/pending scopes queue by subrole", async () => {
      const apiPrez = await as(president)
      const prezQueue = await apiPrez.get(`${BASE}/proposals/pending`)
      expect(prezQueue.status).toBe(200)
      expect(prezQueue.body.proposals.some((p) => String(p._id) === String(proposalId))).toBe(true)

      const apiSa = await as(saAdmin)
      const saQueue = await apiSa.get(`${BASE}/proposals/pending`)
      expect(saQueue.status).toBe(200)
      expect(saQueue.body.proposals.some((p) => String(p._id) === String(proposalId))).toBe(false)
    })

    it("GET /proposals/:id returns the proposal; 404 unknown", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/proposals/${proposalId}`)
      expect(ok.status).toBe(200)
      expect(ok.body.proposal._id).toBe(proposalId)

      const missing = await api.get(`${BASE}/proposals/000000000000000000000000`)
      expect(missing.status).toBe(404)
    })

    it("out-of-chain approver gets 403 (Officer at President stage)", async () => {
      const api = await as(officerSa)
      const res = await api.post(`${BASE}/proposals/${proposalId}/approve`).send({})
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only President Gymkhana can approve/)
    })

    it("President approves -> pending_student_affairs", async () => {
      const api = await as(president)
      const res = await api.post(`${BASE}/proposals/${proposalId}/approve`).send({ comments: "fine" })
      expect(res.status).toBe(200)
      expect(res.body.proposal.status).toBe("pending_student_affairs")
    })

    it("SA forwarding requires next recommender selection", async () => {
      const api = await as(saAdmin)
      const res = await api.post(`${BASE}/proposals/${proposalId}/approve`).send({})
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Select at least one next recommender/)
    })

    it("SA forwards with assigned Officer; wrong officer is then rejected", async () => {
      const apiSa = await as(saAdmin)
      const forwarded = await apiSa
        .post(`${BASE}/proposals/${proposalId}/approve`)
        .send({
          nextApprovers: [{ stage: "Officer SA", userId: String(officerSa._id) }],
        })
      expect(forwarded.status).toBe(200)
      expect(forwarded.body.proposal.status).toBe("pending_officer")
      expect(String(forwarded.body.proposal.currentApproverUser)).toBe(String(officerSa._id))

      const otherOfficer = await saFixtures.adminWithSubRole("Officer SA")
      const apiOther = await as(otherOfficer)
      const denied = await apiOther.post(`${BASE}/proposals/${proposalId}/approve`).send({})
      expect(denied.status).toBe(403)
      expect(denied.body.message).toMatch(/assigned approver/)
    })

    it("assigned Officer approves final step -> approved; event becomes proposal_approved", async () => {
      const api = await as(officerSa)
      const res = await api.post(`${BASE}/proposals/${proposalId}/approve`).send({})
      expect(res.status).toBe(200)
      expect(res.body.proposal.status).toBe("approved")
      expect(res.body.proposal.approvedAt).toBeTruthy()

      const eventRes = await (await as(admin)).get(`${BASE}/${eventId}`)
      expect(eventRes.body.event.status).toBe("proposal_approved")
    })

    it("revision workflow: President requests revision, GS resubmits", async () => {
      // Second event/proposal pair
      const apiAdmin = await as(admin)
      const year = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2028-29", allowProposalBeforeApproval: true, events: [calEvent("Revision Fest")] })
      const revEventId = year.body.calendar.events[0]._id

      const apiGs = await as(gs)
      const submitted = await apiGs
        .post(`${BASE}/events/${revEventId}/proposal`)
        .send(proposalPayload())
      revisionProposalId = submitted.body.proposal._id

      const apiPrez = await as(president)
      const shortComments = await apiPrez
        .post(`${BASE}/proposals/${revisionProposalId}/revision`)
        .send({ comments: "" })
      expect(shortComments.status).toBe(200) // comments optional/default ""

      const revised = await apiPrez.get(`${BASE}/proposals/${revisionProposalId}`)
      expect(revised.body.proposal.status).toBe("revision_requested")
      expect(revised.body.proposal.currentApprovalStage).toBe("GS Gymkhana")

      const resub = await apiGs
        .put(`${BASE}/proposals/${revisionProposalId}`)
        .send({ proposalText: "Revised proposal text with more details." })
      expect(resub.status).toBe(200)
      expect(resub.body.proposal.status).toBe("pending_president")
      expect(resub.body.proposal.revisionCount).toBe(1)
    })

    it("rejection workflow: President rejects, GS edits and resubmits", async () => {
      const apiAdmin = await as(admin)
      const year = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2029-30", allowProposalBeforeApproval: true, events: [calEvent("Reject Fest")] })
      const rejEventId = year.body.calendar.events[0]._id

      const apiGs = await as(gs)
      const submitted = await apiGs
        .post(`${BASE}/events/${rejEventId}/proposal`)
        .send(proposalPayload())
      rejectProposalId = submitted.body.proposal._id

      const apiPrez = await as(president)
      const shortReason = await apiPrez
        .post(`${BASE}/proposals/${rejectProposalId}/reject`)
        .send({ reason: "nope" })
      expect(shortReason.status).toBe(422)

      const rejected = await apiPrez
        .post(`${BASE}/proposals/${rejectProposalId}/reject`)
        .send({ reason: "The budget exceeds the allocated cap significantly" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.proposal.status).toBe("rejected")
      expect(rejected.body.proposal.rejectionReason).toMatch(/budget exceeds/)

      const resub = await apiGs
        .put(`${BASE}/proposals/${rejectProposalId}`)
        .send({ totalExpenditure: 500 })
      expect(resub.status).toBe(200)
      expect(resub.body.proposal.status).toBe("pending_president")
    })

    it("admin override edit requires a reason and does not change status", async () => {
      const api = await as(admin)
      const noReason = await api
        .put(`${BASE}/proposals/${rejectProposalId}/admin`)
        .send({ proposalText: "Admin edited text that is long enough." })
      expect(noReason.status).toBe(422)

      const edited = await api
        .put(`${BASE}/proposals/${rejectProposalId}/admin`)
        .send({
          proposalText: "Admin corrected the proposal text surgically.",
          reason: "Fixing typo flagged by SA office",
        })
      expect(edited.status).toBe(200)
      expect(edited.body.proposal.status).toBe("pending_president")
      expect(edited.body.proposal.proposalText).toMatch(/surgically/)
    })

    it("admin soft-delete unlinks proposal from event; restore re-links", async () => {
      const api = await as(admin)
      const deleted = await api
        .delete(`${BASE}/proposals/${rejectProposalId}`)
        .query({ reason: "Duplicate submission cleanup" })
      expect(deleted.status).toBe(200)
      expect(deleted.body.proposalId).toBe(rejectProposalId)

      const deletedList = await api.get(`${BASE}/admin/deleted`)
      expect(deletedList.status).toBe(200)
      expect(
        deletedList.body.proposals.some((p) => String(p._id) === String(rejectProposalId))
      ).toBe(true)

      const restoreNotDeleted = await api.post(`${BASE}/proposals/${proposalId}/restore`).send({})
      expect(restoreNotDeleted.status).toBe(400)

      const restored = await api.post(`${BASE}/proposals/${rejectProposalId}/restore`).send({})
      expect(restored.status).toBe(200)
      expect(restored.body.proposal.isDeleted).toBe(false)
    })

    it("proposal history logs the full timeline", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/proposals/${proposalId}/history`)
      expect(res.status).toBe(200)
      const actions = res.body.history.map((h) => h.action)
      expect(actions).toContain("submitted")
      expect(actions).toContain("recommended")
      expect(actions).toContain("approved")
    })

    it("audit endpoint supports known entity types only", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/audit/EventProposal/${proposalId}`)
      expect(ok.status).toBe(200)

      const bad = await api.get(`${BASE}/audit/UnknownEntity/${proposalId}`)
      expect(bad.status).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT EXPENSES (bills)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("event expenses", () => {
    let expenseId
    let rejectExpenseId

    it("401 unauthenticated expense submission", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/events/${eventId}/expenses`).send(expensePayload())
      expect(res.status).toBe(401)
    })

    it("403 non-GS roles cannot submit expenses", async () => {
      const api = await as(president)
      const res = await api.post(`${BASE}/events/${eventId}/expenses`).send(expensePayload())
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only GS Gymkhana/)
    })

    it("400 expenses require an approved proposal first", async () => {
      // Use an event whose proposal is still pending_president
      const apiAdmin = await as(admin)
      const year = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2030-31", allowProposalBeforeApproval: true, events: [calEvent("Expense Gate Fest")] })
      const pendingEventId = year.body.calendar.events[0]._id
      await (await as(gs)).post(`${BASE}/events/${pendingEventId}/proposal`).send(proposalPayload())

      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${pendingEventId}/expenses`).send(expensePayload())
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/approved events/)
    })

    it("422 invalid bill payload", async () => {
      const api = await as(gs)
      const res = await api
        .post(`${BASE}/events/${eventId}/expenses`)
        .send({ bills: [], eventReportDocumentUrl: "https://files.hms.test/r.pdf" })
      expect(res.status).toBe(422)
    })

    it("201 GS submits expense -> pending_student_affairs", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${eventId}/expenses`).send(expensePayload())
      expect(res.status).toBe(201)
      expect(res.body.expense.approvalStatus).toBe("pending_student_affairs")
      expect(res.body.expense.bills).toHaveLength(1)
      expect(res.body.expense.estimatedBudget).toBe(1000) // snapshot from proposal expenditure
      expenseId = res.body.expense._id
    })

    it("400 duplicate expense for the same event", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/events/${eventId}/expenses`).send(expensePayload())
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/already submitted/)
    })

    it("GET /expenses lists expenses scoped to viewer", async () => {
      const apiSa = await as(saAdmin)
      const saView = await apiSa.get(`${BASE}/expenses`)
      expect(saView.status).toBe(200)
      expect(saView.body.expenses.some((e) => String(e._id) === String(expenseId))).toBe(true)

      const apiGs = await as(gs)
      const gsView = await apiGs.get(`${BASE}/expenses`)
      expect(gsView.status).toBe(200)
      expect(gsView.body.expenses.every(
        (e) => String(e.submittedBy?._id || e.submittedBy) === String(gs._id)
      )).toBe(true)
    })

    it("GET /events/:eventId/expenses returns the linked expense; 404 otherwise", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/events/${eventId}/expenses`)
      expect(ok.status).toBe(200)
      expect(ok.body.expense._id).toBe(expenseId)

      const missing = await api.get(`${BASE}/events/000000000000000000000000/expenses`)
      expect(missing.status).toBe(404)
    })

    it("expense approval chain: SA forwards to assigned Officer then Associate Dean approves finally", async () => {
      const apiOfficerEarly = await as(officerSa)
      const early = await apiOfficerEarly.post(`${BASE}/expenses/${expenseId}/approve`).send({})
      expect(early.status).toBe(403)
      expect(early.body.message).toMatch(/Only Student Affairs can approve/)

      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/expenses/${expenseId}/approve`)
        .send({
          nextApprovers: [
            { stage: "Officer SA", userId: String(officerSa._id) },
            { stage: "Associate Dean SA", userId: String(assocDeanSa._id) },
          ],
        })
      expect(forward.status).toBe(200)
      expect(forward.body.expense.approvalStatus).toBe("pending_officer")

      const apiOfficer = await as(officerSa)
      const step2 = await apiOfficer.post(`${BASE}/expenses/${expenseId}/approve`).send({})
      expect(step2.status).toBe(200)
      expect(step2.body.expense.approvalStatus).toBe("pending_associate_dean")

      const apiAd = await as(assocDeanSa)
      const final = await apiAd.post(`${BASE}/expenses/${expenseId}/approve`).send({})
      expect(final.status).toBe(200)
      expect(final.body.expense.approvalStatus).toBe("approved")

      const eventRes = await (await as(admin)).get(`${BASE}/${eventId}`)
      expect(eventRes.body.event.status).toBe("completed")
    })

    it("approved bills cannot be edited by GS", async () => {
      const api = await as(gs)
      const res = await api.put(`${BASE}/expenses/${expenseId}`).send({ notes: "try edit" })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Approved bills cannot be edited/)
    })

    it("reject -> GS update resets to pending_student_affairs", async () => {
      const apiAdmin = await as(admin)
      const year = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2031-32", allowProposalBeforeApproval: true, events: [calEvent("Reject Expense Fest")] })
      const rejEventId = year.body.calendar.events[0]._id
      const apiGs = await as(gs)
      const apiPrez = await as(president)
      const submittedProposal = await apiGs
        .post(`${BASE}/events/${rejEventId}/proposal`)
        .send(proposalPayload())
      expect(submittedProposal.status).toBe(201)

      // approve the proposal through the chain quickly
      const prezQueue = await apiPrez.get(`${BASE}/proposals/pending`)
      const pending = prezQueue.body.proposals.find(
        (p) => String(p.eventId?._id || p.eventId) === String(rejEventId)
      )
      expect(pending).toBeTruthy()
      await apiPrez.post(`${BASE}/proposals/${pending._id}/approve`).send({})
      await (await as(saAdmin))
        .post(`${BASE}/proposals/${pending._id}/approve`)
        .send({ directApprove: true })

      const submitted = await apiGs
        .post(`${BASE}/events/${rejEventId}/expenses`)
        .send(expensePayload())
      const rejExpenseId = submitted.body.expense._id

      const apiSa = await as(saAdmin)
      const rejected = await apiSa
        .post(`${BASE}/expenses/${rejExpenseId}/reject`)
        .send({ reason: "Original bills are missing vendor details" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.expense.approvalStatus).toBe("rejected")

      const updated = await apiGs
        .put(`${BASE}/expenses/${rejExpenseId}`)
        .send({ notes: "Added vendor details offline" })
      expect(updated.status).toBe(200)
      expect(updated.body.expense.approvalStatus).toBe("pending_student_affairs")
      expect(updated.body.expense.rejectionReason).toBe("")
    })

    it("admin surgical edit keeps status; soft delete + restore lifecycle works", async () => {
      const api = await as(admin)
      const surgical = await api
        .put(`${BASE}/expenses/${expenseId}/admin`)
        .send({ notes: "Verified by audit team", reason: "Audit correction" })
      expect(surgical.status).toBe(200)
      expect(surgical.body.expense.approvalStatus).toBe("approved")
      expect(surgical.body.expense.notes).toBe("Verified by audit team")

      const deleted = await api
        .delete(`${BASE}/expenses/${expenseId}`)
        .query({ reason: "Erroneous submission" })
      expect(deleted.status).toBe(200)

      const deletedList = await api.get(`${BASE}/admin/deleted`)
      expect(deletedList.body.expenses.some((e) => String(e._id) === String(expenseId))).toBe(true)

      const restore = await api.post(`${BASE}/expenses/${expenseId}/restore`).send({})
      expect(restore.status).toBe(200)
      expect(restore.body.expense.isDeleted).toBe(false)
    })

    it("expense history records the chain", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/expenses/${expenseId}/history`)
      expect(res.status).toBe(200)
      const stages = res.body.history.map((h) => h.stage)
      expect(stages).toEqual(expect.arrayContaining(["GS Gymkhana", "Student Affairs"]))
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // CALENDAR AMENDMENTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("calendar amendments", () => {
    let amendmentId
    let rejectAmendmentId

    it("401 unauthenticated amendment request", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/amendments`).send({})
      expect(res.status).toBe(401)
    })

    it("403 only GS can request amendments", async () => {
      const api = await as(president)
      const res = await api.post(`${BASE}/amendments`).send({
        type: "edit",
        eventId,
        proposedChanges: calEvent("President Attempt"),
        reason: "Because the schedule changed unexpectedly",
      })
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only GS Gymkhana/)
    })

    it("422 invalid amendment payload (edit without eventId)", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/amendments`).send({
        type: "edit",
        proposedChanges: calEvent("Missing target"),
        reason: "Reason long enough for validation",
      })
      expect(res.status).toBe(422)
    })

    it("201 GS requests an edit amendment against an approved calendar event", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/amendments`).send({
        type: "edit",
        eventId,
        proposedChanges: calEvent("Tech Symposium Final Edition"),
        reason: "Chief guest availability forced a schedule change",
      })
      expect(res.status).toBe(201)
      expect(res.body.amendment.status).toBe("pending")
      expect(res.body.amendment.type).toBe("edit")
      amendmentId = res.body.amendment._id
    })

    it("201 GS requests a new_event amendment; admin rejects it", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/amendments`).send({
        type: "new_event",
        proposedChanges: calEvent("Pop-up Hackathon"),
        reason: "Students requested an additional hackathon this year",
      })
      expect(res.status).toBe(201)
      rejectAmendmentId = res.body.amendment._id

      const apiAdmin = await as(admin)
      const rejected = await apiAdmin
        .post(`${BASE}/amendments/${rejectAmendmentId}/reject`)
        .send({ reviewComments: "Calendar is frozen for this year" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.amendment.status).toBe("rejected")

      const twice = await apiAdmin
        .post(`${BASE}/amendments/${rejectAmendmentId}/reject`)
        .send({ reviewComments: "again" })
      expect(twice.status).toBe(400)
      expect(twice.body.message).toMatch(/not pending/)
    })

    it("non-admin review is forbidden", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/amendments/${amendmentId}/approve`).send({})
      expect(res.status).toBe(403)
    })

    it("admin approval applies the proposed change to the event", async () => {
      const api = await as(admin)
      const approved = await api
        .post(`${BASE}/amendments/${amendmentId}/approve`)
        .send({ reviewComments: "Approved by SA office" })
      expect(approved.status).toBe(200)
      expect(approved.body.amendment.status).toBe("approved")

      const eventRes = await api.get(`${BASE}/${eventId}`)
      expect(eventRes.body.event.title).toBe("Tech Symposium Final Edition")
    })

    it("GET /amendments lists pending ones for admins", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/amendments`)
      expect(res.status).toBe(200)
      expect(res.body.amendments.every((a) => a.status === "pending")).toBe(true)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MEGA EVENTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("mega events", () => {
    let seriesId
    let occurrenceId
    let megaProposalId

    it("403 non-admin cannot create a series", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/mega-series`).send({ name: "Technovate Series" })
      expect(res.status).toBe(403)
    })

    it("201 admin creates a mega series", async () => {
      const api = await as(admin)
      const res = await api
        .post(`${BASE}/mega-series`)
        .send({ name: "Technovate Mega Series", description: "Annual flagship series" })
      expect(res.status).toBe(201)
      expect(res.body.series.name).toBe("Technovate Mega Series")
      seriesId = res.body.series._id
    })

    it("400 duplicate series name", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/mega-series`).send({ name: "Technovate Mega Series" })
      expect(res.status).toBe(400)
    })

    it("GET /mega-series lists series; GET by id works; unknown id 404", async () => {
      const api = await as(admin)
      const list = await api.get(`${BASE}/mega-series`)
      expect(list.status).toBe(200)
      expect(list.body.series.some((s) => String(s._id) === String(seriesId))).toBe(true)

      const one = await api.get(`${BASE}/mega-series/${seriesId}`)
      expect(one.status).toBe(200)

      const missing = await api.get(`${BASE}/mega-series/000000000000000000000000`)
      expect(missing.status).toBe(404)
    })

    it("422 occurrence end date before start date", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/mega-series/${seriesId}/occurrences`).send({
        startDate: daysFromNow(90),
        endDate: daysFromNow(89),
      })
      expect(res.status).toBe(422)
    })

    it("201 admin adds an occurrence", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/mega-series/${seriesId}/occurrences`).send({
        startDate: daysFromNow(90),
        endDate: daysFromNow(92),
      })
      expect(res.status).toBe(201)
      expect(res.body.occurrence).toBeTruthy()
      occurrenceId = res.body.occurrence._id
    })

    it("403 GS cannot submit mega proposals (President only)", async () => {
      const api = await as(gs)
      const res = await api
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal`)
        .send(proposalPayload())
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Only President Gymkhana/)
    })

    it("201 President submits mega proposal -> starts at Student Affairs stage", async () => {
      const api = await as(president)
      const res = await api
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal`)
        .send(proposalPayload())
      expect(res.status).toBe(201)
      expect(res.body.proposal.status).toBe("pending_student_affairs")
      megaProposalId = res.body.proposal._id
    })

    it("400 duplicate mega proposal", async () => {
      const api = await as(president)
      const res = await api
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal`)
        .send(proposalPayload())
      expect(res.status).toBe(400)
    })

    it("mega proposal approval chain via nextApprovalStages", async () => {
      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/approve`)
        .send({ nextApprovalStages: ["Officer SA"] })
      expect(forward.status).toBe(200)
      expect(forward.body.proposal.status).toBe("pending_officer")

      const apiOfficer = await as(officerSa)
      const final = await apiOfficer
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/approve`)
        .send({})
      expect(final.status).toBe(200)
      expect(final.body.proposal.status).toBe("approved")
    })

    it("GET mega proposal + history endpoints", async () => {
      const api = await as(admin)
      const one = await api.get(`${BASE}/mega-occurrences/${occurrenceId}/proposal`)
      expect(one.status).toBe(200)
      expect(one.body.proposal.status).toBe("approved")

      const history = await api.get(`${BASE}/mega-occurrences/${occurrenceId}/proposal/history`)
      expect(history.status).toBe(200)
      expect(history.body.history.length).toBeGreaterThan(0)
    })

    it("mega expense submit + approval chain", async () => {
      const apiPrez = await as(president)
      const denied = await apiPrez
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses`)
        .send(expensePayload())
      expect(denied.status).toBe(403)
      expect(denied.body.message).toMatch(/Only GS Gymkhana/)

      const apiGs = await as(gs)
      const submitted = await apiGs
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses`)
        .send(expensePayload())
      expect(submitted.status).toBe(201)
      expect(submitted.body.expense.approvalStatus).toBe("pending_student_affairs")

      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/approve`)
        .send({ nextApprovalStages: ["Dean SA"] })
      expect(forward.status).toBe(200)
      expect(forward.body.expense.approvalStatus).toBe("pending_dean")

      const apiDean = await as(deanSa)
      const final = await apiDean
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/approve`)
        .send({})
      expect(final.status).toBe(200)
      expect(final.body.expense.approvalStatus).toBe("approved")

      const history = await (await as(admin)).get(
        `${BASE}/mega-occurrences/${occurrenceId}/expenses/history`
      )
      expect(history.status).toBe(200)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GENERAL EVENT ROUTES / DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════
  describe("general routes", () => {
    it("GET / lists events with pagination; query validation enforced", async () => {
      const api = await as(admin)
      const ok = await api.get(BASE).query({ limit: 5 })
      expect(ok.status).toBe(200)
      expect(Array.isArray(ok.body.events)).toBe(true)
      expect(ok.body.pagination.limit).toBe(5)

      const bad = await api.get(BASE).query({ limit: 1000 })
      expect(bad.status).toBe(422)
    })

    it("GET /:id returns one event; unknown id 404", async () => {
      const api = await as(admin)
      const ok = await api.get(`${BASE}/${eventId}`)
      expect(ok.status).toBe(200)
      expect(ok.body.event._id).toBe(eventId)

      const missing = await api.get(`${BASE}/000000000000000000000000`)
      expect(missing.status).toBe(404)
    })

    it("GET /calendar-view returns events and holidays", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/calendar-view`).query({ isMegaEvent: false })
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.events)).toBe(true)
      expect(Array.isArray(res.body.holidays)).toBe(true)
    })

    it("dashboard summary is Gymkhana-only", async () => {
      const apiAdmin = await as(admin)
      const denied = await apiAdmin.get(`${BASE}/dashboard/summary`)
      expect(denied.status).toBe(403)

      const apiGs = await as(gs)
      const ok = await apiGs.get(`${BASE}/dashboard/summary`)
      expect(ok.status).toBe(200)
      expect(Array.isArray(ok.body.years)).toBe(true)
      expect(typeof ok.body.pendingProposalsCount).toBe("number")
    })

    it("gymkhana profile returns the caller", async () => {
      const api = await as(gs)
      const res = await api.get(`${BASE}/profile`)
      expect(res.status).toBe(200)
      expect(String(res.body.profile._id || res.body.profile.id)).toBe(String(gs.id ?? gs._id))
    })

    it("post-student-affairs approver options list seeded SA admins", async () => {
      const api = await as(saAdmin)
      const res = await api.get(`${BASE}/approval/post-student-affairs-approvers`)
      expect(res.status).toBe(200)
      expect(res.body.approversByStage["Officer SA"].length).toBeGreaterThan(0)
      expect(res.body.approversByStage["Dean SA"].length).toBeGreaterThan(0)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: BUDGET CAP ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: budget caps", () => {
    let cappedCalendarId

    it("400 when an event's category total exceeds its budget cap at create", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar`).send({
        academicYear: "2041-42",
        budgetCaps: { technical: 1000 },
        events: [calEvent("Over Cap Event", { estimatedBudget: 5000 })],
      })
      expect(res.status).toBe(400)
      // sendRawResponse failure -> bare { message }
      expect(res.body.message).toMatch(/exceeds the configured cap/)
      expect(res.body.message).toMatch(/Technical/)
    })

    it("400 when configured category caps exceed the overall budget", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar`).send({
        academicYear: "2041-42",
        overallBudget: 500,
        budgetCaps: { technical: 400, cultural: 300 },
        events: [
          calEvent("Small Technical", { estimatedBudget: 100 }),
          calEvent("Small Cultural", { category: "cultural", estimatedBudget: 50 }),
        ],
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/exceed the calendar overall budget cap/)
    })

    it("201 creates a calendar whose events sit under their caps (fixture)", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/calendar`).send({
        academicYear: "2042-43",
        budgetCaps: { technical: 9000, cultural: 8000 },
        events: [
          calEvent("Capped Technical", { estimatedBudget: 4000 }),
          calEvent("Capped Cultural", { category: "cultural", estimatedBudget: 3000 }),
        ],
      })
      expect(res.status).toBe(201)
      cappedCalendarId = res.body.calendar._id

      const verify = await api.get(`${BASE}/calendar/${cappedCalendarId}`)
      expect(verify.status).toBe(200)
      expect(verify.body.calendar.budgetCaps.technical).toBe(9000)
    })

    it("400 when GS edit pushes a category over its stored cap", async () => {
      const api = await as(admin)
      const current = await api.get(`${BASE}/calendar/${cappedCalendarId}`)
      const events = current.body.calendar.events.map((e) => ({ ...e }))
      events[0].estimatedBudget = 9500 // technical total would exceed the 9000 cap

      const apiGs = await as(gs)
      const res = await apiGs.put(`${BASE}/calendar/${cappedCalendarId}`).send({ events })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/exceeds the configured cap/)

      // The calendar must be untouched after the rejected edit
      const verify = await (await as(admin)).get(`${BASE}/calendar/${cappedCalendarId}`)
      const unchanged = verify.body.calendar.events.find((e) => e.title === "Capped Technical")
      expect(unchanged.estimatedBudget).toBe(4000)
    })

    it("400 when admin settings lower a cap below existing event totals", async () => {
      const api = await as(admin)
      const res = await api
        .patch(`${BASE}/calendar/${cappedCalendarId}/settings`)
        .send({ budgetCaps: { technical: 100 } })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Cannot update calendar settings\. /)
      expect(res.body.message).toMatch(/exceeds the configured cap/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: APPROVAL-CHAIN OUT-OF-ORDER ATTEMPTS AT EVERY STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: out-of-order approval attempts", () => {
    let calId

    beforeAll(async () => {
      const api = await as(admin)
      const created = await api
        .post(`${BASE}/calendar`)
        .send({
          academicYear: "2043-44",
          events: [calEvent("Chain Order Fest"), calEvent("Chain Order Gala", { category: "cultural" })],
        })
      calId = created.body.calendar._id

      // Non-overlapping dates so submit goes straight through
      const current = await api.get(`${BASE}/calendar/${calId}`)
      const events = current.body.calendar.events.map((e, i) => ({
        ...e,
        startDate: daysFromNow(60 + i * 5),
        endDate: daysFromNow(61 + i * 5),
      }))
      await as(gs) // warm no-op
      const apiGs = await as(gs)
      await apiGs.put(`${BASE}/calendar/${calId}`).send({ events })
      await (await as(president)).post(`${BASE}/calendar/${calId}/submit`).send({})
    })

    it("Dean SA cannot approve or reject at the Student Affairs stage", async () => {
      const api = await as(deanSa)
      const earlyApprove = await api.post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(earlyApprove.status).toBe(403)
      expect(earlyApprove.body.message).toMatch(/Only Student Affairs can approve at this stage/)

      const earlyReject = await api.post(`${BASE}/calendar/${calId}/reject`).send({
        reason: "Dean should not be able to reject at the first stage",
      })
      expect(earlyReject.status).toBe(403)
      expect(earlyReject.body.message).toMatch(/Only Student Affairs can reject at this stage/)
    })

    it("Associate Dean SA and Officer SA also cannot act at the Student Affairs stage", async () => {
      const apiAd = await as(assocDeanSa)
      const adAttempt = await apiAd.post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(adAttempt.status).toBe(403)

      const apiOfficer = await as(officerSa)
      const officerAttempt = await apiOfficer.post(`${BASE}/calendar/${calId}/reject`).send({
        reason: "Officer is not the first reviewer for calendars",
      })
      expect(officerAttempt.status).toBe(403)
    })

    it("SA forwards via stages-only chain -> Officer; wrong-stage admins are blocked there", async () => {
      const apiSa = await as(saAdmin)
      const forward = await apiSa
        .post(`${BASE}/calendar/${calId}/approve`)
        .send({ nextApprovalStages: ["Officer SA", "Associate Dean SA", "Dean SA"] })
      expect(forward.status).toBe(200)
      expect(forward.body.calendar.status).toBe("pending_officer")

      // SA itself is now out of order
      const saAgain = await (await as(saAdmin)).post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(saAgain.status).toBe(403)
      expect(saAgain.body.message).toMatch(/Only Officer SA can approve at this stage/)

      // Later-stage admins are out of order too
      const deanEarly = await (await as(deanSa)).post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(deanEarly.status).toBe(403)
      expect(deanEarly.body.message).toMatch(/Only Officer SA can approve at this stage/)

      const assocRejectEarly = await (await as(assocDeanSa))
        .post(`${BASE}/calendar/${calId}/reject`)
        .send({ reason: "Wrong stage reject attempt from Associate Dean" })
      expect(assocRejectEarly.status).toBe(403)
      expect(assocRejectEarly.body.message).toMatch(/Only Officer SA can reject at this stage/)
    })

    it("each later stage rejects both premature actors and repeat actors", async () => {
      // Officer approves -> pending_associate_dean
      const step2 = await (await as(officerSa)).post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(step2.status).toBe(200)
      expect(step2.body.calendar.status).toBe("pending_associate_dean")

      // Officer tries to act twice
      const officerRepeat = await (await as(officerSa))
        .post(`${BASE}/calendar/${calId}/approve`)
        .send({})
      expect(officerRepeat.status).toBe(403)
      expect(officerRepeat.body.message).toMatch(/Only Associate Dean SA can approve at this stage/)

      // Assoc Dean approves -> pending_dean
      const step3 = await (await as(assocDeanSa)).post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(step3.status).toBe(200)
      expect(step3.body.calendar.status).toBe("pending_dean")

      const assocRepeat = await (await as(assocDeanSa))
        .post(`${BASE}/calendar/${calId}/approve`)
        .send({})
      expect(assocRepeat.status).toBe(403)
      expect(assocRepeat.body.message).toMatch(/Only Dean SA can approve at this stage/)

      // Dean approves -> approved
      const final = await (await as(deanSa)).post(`${BASE}/calendar/${calId}/approve`).send({})
      expect(final.status).toBe(200)
      expect(final.body.calendar.status).toBe("approved")

      // Double decision idempotency: approve/reject on a finalized calendar
      const doubleApprove = await (await as(deanSa))
        .post(`${BASE}/calendar/${calId}/approve`)
        .send({})
      expect(doubleApprove.status).toBe(400)
      expect(doubleApprove.body.message).toMatch(/not pending approval/)

      const rejectFinalized = await (await as(saAdmin))
        .post(`${BASE}/calendar/${calId}/reject`)
        .send({ reason: "Rejection after final approval must not be possible" })
      expect(rejectFinalized.status).toBe(400)
      expect(rejectFinalized.body.message).toMatch(/not pending approval/)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: AMENDMENTS ON NON-PENDING CALENDARS & CAP VIOLATIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: amendments on rejected/draft calendars & caps", () => {
    it("404 for an edit amendment against an unknown eventId", async () => {
      const api = await as(gs)
      const res = await api.post(`${BASE}/amendments`).send({
        type: "edit",
        eventId: "000000000000000000000000",
        proposedChanges: calEvent("Ghost Edit"),
        reason: "This amendment targets an event that does not exist",
      })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/Event to edit/)
    })

    it("amendments can be raised and applied against a REJECTED calendar", async () => {
      // Build -> submit -> reject a fresh calendar
      const apiAdmin = await as(admin)
      const created = await apiAdmin
        .post(`${BASE}/calendar`)
        .send({ academicYear: "2044-45", events: [calEvent("Rejected Calendar Event")] })
      const rejCalId = created.body.calendar._id
      const rejEventId = created.body.calendar.events[0]._id

      await (await as(president)).post(`${BASE}/calendar/${rejCalId}/submit`).send({})
      const rejected = await (await as(saAdmin))
        .post(`${BASE}/calendar/${rejCalId}/reject`)
        .send({ reason: "Initial submission needs a schedule revision" })
      expect(rejected.status).toBe(200)
      expect(rejected.body.calendar.status).toBe("rejected")

      // NOTE: amendment creation/approval never checks calendar status — even a
      // rejected (and locked) calendar's events can be mutated via amendments.
      const apiGs = await as(gs)
      const amendment = await apiGs.post(`${BASE}/amendments`).send({
        type: "edit",
        eventId: rejEventId,
        proposedChanges: calEvent("Rejected Calendar Event Revamped"),
        reason: "Fixing the event on the rejected calendar per SA feedback",
      })
      expect(amendment.status).toBe(201)
      const amendmentId = amendment.body.amendment._id

      const approved = await apiAdmin
        .post(`${BASE}/amendments/${amendmentId}/approve`)
        .send({ reviewComments: "Applied despite rejected status" })
      expect(approved.status).toBe(200)
      expect(approved.body.amendment.status).toBe("approved")

      const eventRes = await apiAdmin.get(`${BASE}/${rejEventId}`)
      expect(eventRes.body.event.title).toBe("Rejected Calendar Event Revamped")
    })

    it("amendment approval is blocked when the proposal exceeds the calendar's budget cap", async () => {
      const apiAdmin = await as(admin)
      const created = await apiAdmin.post(`${BASE}/calendar`).send({
        academicYear: "2045-46",
        budgetCaps: { technical: 5000 },
        events: [calEvent("Cap Amendment Event", { estimatedBudget: 3000 })],
      })
      const capEventId = created.body.calendar.events[0]._id

      const apiGs = await as(gs)
      const amendment = await apiGs.post(`${BASE}/amendments`).send({
        type: "edit",
        eventId: capEventId,
        proposedChanges: calEvent("Cap Amendment Event", { estimatedBudget: 8000 }),
        reason: "Vendor quote came in higher than the original estimate",
      })
      expect(amendment.status).toBe(201)

      const denied = await apiAdmin
        .post(`${BASE}/amendments/${amendment.body.amendment._id}/approve`)
        .send({ reviewComments: "Trying to blow past the cap" })
      expect(denied.status).toBe(400)
      expect(denied.body.message).toMatch(/exceeds the configured cap/)

      // The event keeps its original budget after the failed approval
      const eventRes = await apiAdmin.get(`${BASE}/${capEventId}`)
      expect(eventRes.body.event.estimatedBudget).toBe(3000)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: PROPOSAL DOCUMENT fileRefs WITH UNREACHABLE STORAGE
  //
  // The API treats proposalDocumentUrl / chiefGuestDocumentUrl as opaque strings:
  // nothing validates reachability at submit time and GET returns them verbatim.
  // These tests pin that behavior (storage IS unreachable in this suite).
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: proposal fileRefs with unreachable storage", () => {
    it("submission persists unreachable document refs verbatim and GET echoes them back", async () => {
      const apiAdmin = await as(admin)
      const year = await apiAdmin.post(`${BASE}/calendar`).send({
        academicYear: "2046-47",
        allowProposalBeforeApproval: true,
        events: [calEvent("Unreachable Ref Fest")],
      })
      const refEventId = year.body.calendar.events[0]._id

      const UNREACHABLE = "https://storage.unreachable.invalid/proposals/dead-ref.pdf"
      const apiGs = await as(gs)
      const submitted = await apiGs
        .post(`${BASE}/events/${refEventId}/proposal`)
        .send({
          ...proposalPayload(),
          proposalDocumentUrl: UNREACHABLE,
          chiefGuestDocumentUrl: "media://deadbeef-dead-dead-dead-deadbeefdead",
        })
      expect(submitted.status).toBe(201)
      expect(submitted.body.proposal.proposalDocumentUrl).toBe(UNREACHABLE)

      const fetched = await apiAdmin.get(`${BASE}/events/${refEventId}/proposal`)
      expect(fetched.status).toBe(200)
      expect(fetched.body.proposal.proposalDocumentUrl).toBe(UNREACHABLE)
      expect(fetched.body.proposal.chiefGuestDocumentUrl).toBe(
        "media://deadbeef-dead-dead-dead-deadbeefdead"
      )
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDENING: MEGA-OCCURRENCE CRUD EDGES + MEGA DOUBLE DECISIONS
  // ═══════════════════════════════════════════════════════════════════════════
  describe("hardening: mega occurrence edges & double decisions", () => {
    let seriesId
    let occurrenceId

    it("403 non-admin cannot add occurrences to a series", async () => {
      const setup = await (await as(admin))
        .post(`${BASE}/mega-series`)
        .send({ name: "Hardening Mega Series" })
      seriesId = setup.body.series._id

      const apiGs = await as(gs)
      const res = await apiGs.post(`${BASE}/mega-series/${seriesId}/occurrences`).send({
        startDate: daysFromNow(120),
        endDate: daysFromNow(121),
      })
      expect(res.status).toBe(403)
      // The RBAC permission gate fires before the service: Gymkhana users lack
      // "route.gymkhana.megaEvents", so the message is the generic access-denied one.
      expect(res.body.message).toMatch(/Access denied/)

      const apiPresident = await as(president)
      expect(
        (
          await apiPresident.post(`${BASE}/mega-series/${seriesId}/occurrences`).send({
            startDate: daysFromNow(120),
            endDate: daysFromNow(121),
          })
        ).status
      ).toBe(403)
    })

    it("422 malformed seriesId and missing dates; 404 unknown series", async () => {
      const api = await as(admin)
      const badId = await api.post(`${BASE}/mega-series/not-an-id/occurrences`).send({
        startDate: daysFromNow(120),
        endDate: daysFromNow(121),
      })
      expect(badId.status).toBe(422)

      const missingDates = await api
        .post(`${BASE}/mega-series/${seriesId}/occurrences`)
        .send({})
      expect(missingDates.status).toBe(422)

      const ghost = await api.post(`${BASE}/mega-series/000000000000000000000000/occurrences`).send({
        startDate: daysFromNow(120),
        endDate: daysFromNow(121),
      })
      expect(ghost.status).toBe(404)
      expect(ghost.body.message).toMatch(/Mega event series/)
    })

    it("201 allows end date equal to start date (single-day boundary)", async () => {
      const api = await as(admin)
      const res = await api.post(`${BASE}/mega-series/${seriesId}/occurrences`).send({
        startDate: daysFromNow(130),
        endDate: daysFromNow(130),
      })
      expect(res.status).toBe(201)
      occurrenceId = res.body.occurrence._id
    })

    it("422 listing a series with a malformed id", async () => {
      const api = await as(admin)
      const res = await api.get(`${BASE}/mega-series/not-an-id`)
      expect(res.status).toBe(422)
    })

    it("404 proposal/expense lookups for an occurrence that does not exist", async () => {
      const api = await as(admin)
      const ghost = "000000000000000000000000"

      const noProposal = await api.get(`${BASE}/mega-occurrences/${ghost}/proposal`)
      expect(noProposal.status).toBe(404)
      expect(noProposal.body.message).toMatch(/Mega event occurrence/)

      const noExpense = await api.get(`${BASE}/mega-occurrences/${ghost}/expenses`)
      expect(noExpense.status).toBe(404)
      expect(noExpense.body.message).toMatch(/Mega event occurrence/)
    })

    it("wrong-stage rejection at pending_student_affairs is forbidden", async () => {
      // President submits the mega proposal (starts at Student Affairs)
      const submitted = await (await as(president))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal`)
        .send(proposalPayload())
      expect(submitted.status).toBe(201)

      const apiOfficer = await as(officerSa)
      const earlyReject = await apiOfficer
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/reject`)
        .send({ reason: "Officer cannot reject at the SA stage" })
      expect(earlyReject.status).toBe(403)
      expect(earlyReject.body.message).toMatch(/Only Student Affairs can reject/)

      const earlyRevision = await apiOfficer
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/revision`)
        .send({ comments: "Out of order revision attempt" })
      expect(earlyRevision.status).toBe(403)
      expect(earlyRevision.body.message).toMatch(/Only Student Affairs can request revision/)
    })

    it("mega expense double decisions are idempotent after final approval", async () => {
      // Approve the pending proposal: SA forwards stages-only -> Officer approves
      const saForward = await (await as(saAdmin))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/approve`)
        .send({ nextApprovalStages: ["Officer SA"] })
      expect(saForward.status).toBe(200)
      const officerApprove = await (await as(officerSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/approve`)
        .send({})
      expect(officerApprove.status).toBe(200)
      expect(officerApprove.body.proposal.status).toBe("approved")

      // Approving the approved proposal again is rejected
      const doubleProposalApprove = await (await as(officerSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/proposal/approve`)
        .send({})
      expect(doubleProposalApprove.status).toBe(400)
      expect(doubleProposalApprove.body.message).toMatch(/already approved/)

      // GS submits the expense (requires the approved proposal)
      const expense = await (await as(gs))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses`)
        .send(expensePayload())
      expect(expense.status).toBe(201)

      // SA forwards to Dean directly; wrong-stage reject along the way is blocked
      const forward = await (await as(saAdmin))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/approve`)
        .send({ nextApprovalStages: ["Dean SA"] })
      expect(forward.status).toBe(200)
      expect(forward.body.expense.approvalStatus).toBe("pending_dean")

      const wrongStageReject = await (await as(officerSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/reject`)
        .send({ reason: "Officer cannot reject while Dean holds the bill" })
      expect(wrongStageReject.status).toBe(403)
      expect(wrongStageReject.body.message).toMatch(/Only Dean SA can reject at this stage/)

      // Dean approves finally...
      const final = await (await as(deanSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/approve`)
        .send({})
      expect(final.status).toBe(200)
      expect(final.body.expense.approvalStatus).toBe("approved")

      // ...and neither decision can be repeated
      const doubleApprove = await (await as(deanSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/approve`)
        .send({})
      expect(doubleApprove.status).toBe(400)
      expect(doubleApprove.body.message).toMatch(/Expense is already approved/)

      const rejectFinalized = await (await as(deanSa))
        .post(`${BASE}/mega-occurrences/${occurrenceId}/expenses/reject`)
        .send({ reason: "Too late — the bill was already approved" })
      expect(rejectFinalized.status).toBe(400)
      expect(rejectFinalized.body.message).toMatch(/Expense is already finalized/)
    })
  })
})
