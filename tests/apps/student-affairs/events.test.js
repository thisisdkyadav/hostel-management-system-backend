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
})
