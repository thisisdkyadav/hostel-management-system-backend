/**
 * Cross-module end-to-end integration suite.
 *
 * Workflow 1 — Events & money:
 *   Gymkhana club user uploads an event proposal PDF via /upload/event-proposal-pdf,
 *   raises the proposal through the SA events module, walks the approval chain
 *   GS Gymkhana -> President Gymkhana -> Student Affairs -> Officer SA ->
 *   Associate Dean SA -> Dean SA (verifying currentApprovalStage at every hop),
 *   then money is recorded against the outcome via /student-affairs/expenditure,
 *   with a negative control for expenses on a non-approved event.
 *
 * Workflow 2 — Accommodation end-to-end with money twists:
 *   submit -> CWO capacity approve -> FA token recommend -> CW approve ->
 *   CWO payment request (per-guest charges) -> student defers -> proof submitted ->
 *   accountant rejects (back to deferred) -> resubmit -> verified -> rooms assigned
 *   (2 guests / 2 rooms) -> gate check-in -> EXTEND approved WITH extraAmount while
 *   the initial payment is already verified (additionalPayments row) -> student pays
 *   the additional bill via the additionalPaymentId path -> accountant verifies it ->
 *   gate check-out -> invoice fetch returns PDF bytes.
 *
 * Envelope note: the SA events module uses sendRawResponse (bare payloads like
 * { proposal }), expenditure + accommodation use { success, message, data }.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import http from "node:http"
import { setupTestDb, teardownTestDb } from "./helpers/db.js"
import { as, anon } from "./helpers/http.js"
import { seed } from "./helpers/seed.js"
import { createHostel, createRoom } from "./helpers/seed/operations.js"

// ---- storage stub ----------------------------------------------------------
// /upload/* and the accommodation invoice issue step both delegate to the
// storage service via storageClient.upload. The real service (:5100) is not up
// in tests, so we stand up a minimal in-process stub (same trick as
// apps/administration/upload.test.js) and point env.storage.serviceUrl at it.

const PDF_BYTES = Buffer.from("%PDF-1.4\n% fake pdf for tests\n%%EOF\n")

let stubServer = null
let originalServiceUrl = null
let originalInternalKey = null

beforeAll(async () => {
  await setupTestDb()

  stubServer = http.createServer((req, res) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const raw = Buffer.concat(chunks)
      const text = raw.toString("latin1")
      const fileMeta = (() => {
        const m = text.match(/name="file"; filename="([^"]*)"\r\nContent-Type: ([^\r\n]+)/i)
        return m ? { filename: m[1], contentType: m[2] } : { filename: "upload.bin", contentType: "application/octet-stream" }
      })()
      const n = stubCalls += 1
      res.setHeader("content-type", "application/json")
      res.end(
        JSON.stringify({
          file_id: `stub-file-${n}`,
          file_ref: `media://stub/${n}-${fileMeta.filename}`,
          url: `http://storage.test/${n}-${fileMeta.filename}`,
          content_type: fileMeta.contentType,
          size: raw.length,
          original_name: fileMeta.filename,
        })
      )
    })
  })
  await new Promise((resolve) => stubServer.listen(0, "127.0.0.1", resolve))

  const { env } = await import("../src/config/env.config.js")
  originalServiceUrl = env.storage.serviceUrl
  originalInternalKey = env.storage.internalApiKey
  env.storage.serviceUrl = `http://127.0.0.1:${stubServer.address().port}`
  if (!originalInternalKey) env.storage.internalApiKey = "test-internal-key"
})

let stubCalls = 0

afterAll(async () => {
  const { env } = await import("../src/config/env.config.js")
  if (originalServiceUrl !== null) env.storage.serviceUrl = originalServiceUrl
  else env.storage.serviceUrl = ""
  if (originalInternalKey !== null) env.storage.internalApiKey = originalInternalKey
  else env.storage.internalApiKey = ""
  await new Promise((resolve) => stubServer.close(resolve))
  await teardownTestDb()
})

// ---- shared fixtures & helpers ----------------------------------------------

const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

const dateOnly = (d) => d.toISOString().slice(0, 10)

const daysFromNow = (days) => {
  const d = day(days)
  d.setHours(10, 0, 0, 0)
  return d.toISOString()
}

const EVENTS_BASE = "/api/v1/student-affairs/events"
const EXPENDITURE_BASE = "/api/v1/student-affairs/expenditure"
const ACC_BASE = "/api/v1/accommodation/requests"

const calEvent = (title, extra = {}) => ({
  title,
  category: "technical",
  startDate: daysFromNow(30),
  endDate: daysFromNow(31),
  estimatedBudget: 5000,
  description: `${title} description for cross-module workflow tests`,
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

const proposalPayload = (overrides = {}) => ({
  proposalText: "We propose to conduct the annual technical fest on campus.",
  proposalDetails: proposalDetails(),
  totalExpectedIncome: 0,
  totalExpenditure: 1000,
  ...overrides,
})

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW 1 — Events & money
// ═════════════════════════════════════════════════════════════════════════════

describe("workflow 1 — event proposal upload -> approval chain -> expenditure", () => {
  let gs // Gymkhana club user (GS Gymkhana subrole)
  let president
  let saAdmin
  let officerSa
  let assocDeanSa
  let deanSa
  let admin

  const ctx = {}

  beforeAll(async () => {
    gs = await seed.createUser({ role: "Gymkhana", subRole: "GS Gymkhana" })
    president = await seed.createUser({ role: "Gymkhana", subRole: "President Gymkhana" })
    saAdmin = await seed.createUser({ role: "Admin", subRole: "Student Affairs" })
    officerSa = await seed.createUser({ role: "Admin", subRole: "Officer SA" })
    assocDeanSa = await seed.createUser({ role: "Admin", subRole: "Associate Dean SA" })
    deanSa = await seed.createUser({ role: "Admin", subRole: "Dean SA" })
    admin = await seed.admin()
  })

  it("club user uploads the proposal PDF via the public upload route", async () => {
    const api = await as(gs)
    const res = await api.post("/api/v1/upload/event-proposal-pdf").attach("document", PDF_BYTES, "techfest-proposal.pdf")
    expect(res.status).toBe(200)
    expect(res.body.fileId).toMatch(/^stub-file-/)
    expect(res.body.fileRef).toMatch(/^media:\/\/stub\//)
    ctx.proposalPdfRef = res.body.fileRef
  })

  it("GS raises the event proposal through the SA events module carrying the uploaded PDF", async () => {
    // Calendar with early-proposal allowed so the flow does not depend on calendar approval.
    const year = await as(admin).then((a) =>
      a.post(`${EVENTS_BASE}/calendar`).send({
        academicYear: "2041-42",
        allowProposalBeforeApproval: true,
        events: [calEvent("Cross Module Tech Fest")],
      })
    )
    expect(year.status).toBe(201)
    ctx.eventId = year.body.calendar.events[0]._id

    const api = await as(gs)
    const res = await api
      .post(`${EVENTS_BASE}/events/${ctx.eventId}/proposal`)
      .send(proposalPayload({ proposalDocumentUrl: ctx.proposalPdfRef }))
    expect(res.status).toBe(201)
    expect(res.body.proposal.status).toBe("pending_president")
    expect(res.body.proposal.currentApprovalStage).toBe("President Gymkhana")
    expect(res.body.proposal.proposalDocumentUrl).toBe(ctx.proposalPdfRef)
    ctx.proposalId = res.body.proposal._id

    const eventRes = await as(admin).then((a) => a.get(`${EVENTS_BASE}/${ctx.eventId}`))
    expect(eventRes.body.event.status).toBe("proposal_submitted")
  })

  it("walks GS Gymkhana -> President -> Student Affairs -> Officer -> Associate Dean -> Dean", async () => {
    // Stage 2: President Gymkhana
    let res = await as(president).then((a) =>
      a.post(`${EVENTS_BASE}/proposals/${ctx.proposalId}/approve`).send({ comments: "Recommended by Gymkhana" })
    )
    expect(res.status).toBe(200)
    expect(res.body.proposal.status).toBe("pending_student_affairs")
    expect(res.body.proposal.currentApprovalStage).toBe("Student Affairs")

    // Stage 3: Student Affairs forwards the full remaining chain
    res = await as(saAdmin).then((a) =>
      a.post(`${EVENTS_BASE}/proposals/${ctx.proposalId}/approve`).send({
        comments: "Forwarding the full SA chain",
        nextApprovalStages: ["Officer SA", "Associate Dean SA", "Dean SA"],
      })
    )
    expect(res.status).toBe(200)
    expect(res.body.proposal.status).toBe("pending_officer")
    expect(res.body.proposal.currentApprovalStage).toBe("Officer SA")

    // Stage 4: Officer SA
    res = await as(officerSa).then((a) =>
      a.post(`${EVENTS_BASE}/proposals/${ctx.proposalId}/approve`).send({})
    )
    expect(res.status).toBe(200)
    expect(res.body.proposal.status).toBe("pending_associate_dean")
    expect(res.body.proposal.currentApprovalStage).toBe("Associate Dean SA")

    // Stage 5: Associate Dean SA
    res = await as(assocDeanSa).then((a) =>
      a.post(`${EVENTS_BASE}/proposals/${ctx.proposalId}/approve`).send({})
    )
    expect(res.status).toBe(200)
    expect(res.body.proposal.status).toBe("pending_dean")
    expect(res.body.proposal.currentApprovalStage).toBe("Dean SA")

    // Final stage: Dean SA -> approved; event flips to proposal_approved
    res = await as(deanSa).then((a) =>
      a.post(`${EVENTS_BASE}/proposals/${ctx.proposalId}/approve`).send({})
    )
    expect(res.status).toBe(200)
    expect(res.body.proposal.status).toBe("approved")
    expect(res.body.proposal.currentApprovalStage).toBeNull()
    expect(res.body.proposal.approvedAt).toBeTruthy()

    const eventRes = await as(admin).then((a) => a.get(`${EVENTS_BASE}/${ctx.eventId}`))
    expect(eventRes.body.event.status).toBe("proposal_approved")
  })

  it("expenditure cannot be recorded by the club user against the approved event", async () => {
    // SUSPECTED BUG (cross-module seam): the events module and the expenditure
    // module are not connected. The expenditure occurrence schema has no event /
    // eventId reference, so there is NO public API way to record expenditure
    // *against* an approved event — occurrences are free-floating ledgers. On
    // top of that, the whole expenditure router is Admin/Super-Admin only, so
    // the Gymkhana club user who owns the approved event cannot even open one.
    const api = await as(gs)
    const res = await api.post(EXPENDITURE_BASE).send({
      title: `Expenditure for event ${ctx.eventId}`,
      description: "Trying to book spend against the approved tech fest",
      totalBudget: 1000,
    })
    expect(res.status).toBe(403)

    // The absence of any linkage field is asserted from the API surface: a
    // created occurrence echoes no event reference whatsoever.
    const adminApi = await as(admin)
    const created = await adminApi.post(EXPENDITURE_BASE).send({
      title: "Approved tech fest expenditure (booked by office)",
      totalBudget: 1000,
    })
    expect(created.status).toBe(201)
    ctx.occurrenceId = created.body.data.occurrence._id

    const expense = await adminApi.post(`${EXPENDITURE_BASE}/${ctx.occurrenceId}/expenses`).send({
      title: "Venue booking against the approved fest",
      amount: 800,
    })
    expect(expense.status).toBe(201)
    expect(expense.body.data.totals.expenseTotal).toBe(800)
    expect(expense.body.data.totals.remainingBudget).toBe(200)
    // Still no linkage back to the event anywhere in the response payload:
    expect(JSON.stringify(expense.body.data)).not.toContain(String(ctx.eventId))
  })

  it("negative control: expenses are refused on a non-approved event's proposal", async () => {
    const year = await as(admin).then((a) =>
      a.post(`${EVENTS_BASE}/calendar`).send({
        academicYear: "2042-43",
        allowProposalBeforeApproval: true,
        events: [calEvent("Not Yet Approved Fest")],
      })
    )
    const pendingEventId = year.body.calendar.events[0]._id

    const submitted = await as(gs).then((a) =>
      a.post(`${EVENTS_BASE}/events/${pendingEventId}/proposal`).send(proposalPayload())
    )
    expect(submitted.status).toBe(201) // still pending_president — nowhere near approved

    const res = await as(gs).then((a) =>
      a.post(`${EVENTS_BASE}/events/${pendingEventId}/expenses`).send({
        bills: [
          {
            description: "Early venue deposit",
            amount: 500,
            attachments: [{ filename: "bill.pdf", url: "https://files.hms.test/bill.pdf" }],
          },
        ],
        eventReportDocumentUrl: "https://files.hms.test/report.pdf",
      })
    )
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/approved events/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// WORKFLOW 2 — Accommodation end-to-end with money twists
// ═════════════════════════════════════════════════════════════════════════════

describe("workflow 2 — accommodation full lifecycle incl. extension additional payment", () => {
  const ctx = {}

  const twoGuestBody = () => ({
    typeKey: "parents-siblings",
    guests: [
      { name: "Ramu Yadav", gender: "Male", age: 52, relation: "Father", aadharNumber: "111122223333" },
      { name: "Sita Yadav", gender: "Female", age: 48, relation: "Mother", aadharNumber: "444455556666" },
    ],
    roomPreference: "Double",
    stay: { fromDate: dateOnly(day(7)), toDate: dateOnly(day(9)) },
    facultyAdvisorEmail: "fa.advisor@iiti.ac.in",
    permanentAddress: "12 Civil Lines",
  })

  const iitiStudent = () =>
    seed.createUser({
      role: "Student",
      email: `wf2-student-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@iiti.ac.in`,
    })

  const cwo = () => seed.createUser({ role: "Admin", subRole: "Chief Warden Office" })
  const chiefWarden = () => seed.createUser({ role: "Admin", subRole: "Chief Warden" })
  const accountant = () => seed.createUser({ role: "Admin", subRole: "Accountant" })

  const proof = () => ({
    utr: "123456789012",
    paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    screenshotFileRef: "media://payments/wf2-receipt.png",
  })

  /** FA recommendation token minted through the action-link service (public token path). */
  async function createFaToken(requestId) {
    const { createActionLinkToken, ACTION_LINK_TOKEN_TYPE } = await import(
      "../src/services/action-links/action-link-token.service.js"
    )
    const { rawToken } = await createActionLinkToken({
      type: ACTION_LINK_TOKEN_TYPE.ACCOMMODATION_FA_RECOMMENDATION,
      subjectModel: "AccommodationRequest",
      subjectId: requestId,
      recipientEmail: "fa.advisor@iiti.ac.in",
      payload: {},
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    return rawToken
  }

  it("student submits the request (persons=2) and CWO clears capacity", async () => {
    ctx.student = await iitiStudent()
    const api = await as(ctx.student)
    const res = await api.post(ACC_BASE).send(twoGuestBody())
    expect(res.status).toBe(201)
    ctx.requestId = res.body.data._id
    expect(res.body.data.status).toBe("Pending CWO Capacity Check")
    expect(res.body.data.persons).toBe(2)
    expect(res.body.data.guests).toHaveLength(2)

    const cwoRes = await as(await cwo()).then((c) =>
      c.post(`${ACC_BASE}/${ctx.requestId}/capacity-decision`).send({ action: "approve" })
    )
    expect(cwoRes.status).toBe(200)
    expect(cwoRes.body.data.status).toBe("Pending FA Recommendation")
    expect(cwoRes.body.data.currentStage).toBe("facultyAdvisor")
  })

  it("FA recommends via the public action-link token and CW approves", async () => {
    const token = await createFaToken(ctx.requestId)
    const anonApi = await anon()

    const view = await anonApi.get(`/api/v1/accommodation/recommendation/${token}`)
    expect(view.status).toBe(200)
    expect(view.body.data.alreadyHandled).toBe(false)
    expect(view.body.data.request.guests).toHaveLength(2)

    const rec = await anonApi.post(`/api/v1/accommodation/recommendation/${token}`).send({
      decision: "recommend",
      reason: "Genuine family visit",
    })
    expect(rec.status).toBe(200)
    expect(rec.body.data.status).toBe("Pending CW Approval")

    const cwRes = await as(await chiefWarden()).then((c) =>
      c.post(`${ACC_BASE}/${ctx.requestId}/decision`).send({ action: "approve" })
    )
    expect(cwRes.status).toBe(200)
    expect(cwRes.body.data.status).toBe("CW Approved")
  })

  it("CWO issues the payment request with per-guest charges; student defers", async () => {
    ctx.hostel = await createHostel()
    ctx.roomA = await createRoom({ hostelId: ctx.hostel._id, roomNumber: `WF2-${Date.now() % 100000}a`, capacity: 2 })
    ctx.roomB = await createRoom({ hostelId: ctx.hostel._id, roomNumber: `WF2-${Date.now() % 100000}b`, capacity: 2 })

    const res = await as(await cwo()).then((c) =>
      c.post(`${ACC_BASE}/${ctx.requestId}/payment-request`).send({
        hostelId: ctx.hostel._id,
        remarks: "Parents visit rate card",
        guestCharges: [
          { guestIndex: 0, price: 600, gstPercentage: 0 },
          { guestIndex: 1, price: 400, gstPercentage: 12 },
        ],
      })
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Requested")
    expect(res.body.data.payment.amount).toBe(1048) // 600 + 400 * 1.12
    expect(String(res.body.data.allotment.hostelId)).toBe(String(ctx.hostel._id))

    const defer = await as(ctx.student).then((a) => a.post(`${ACC_BASE}/${ctx.requestId}/defer-payment`))
    expect(defer.status).toBe(200)
    expect(defer.body.data.status).toBe("Payment Deferred")
    expect(defer.body.data.payment.mode).toBe("later")
  })

  it("proof submitted -> accountant rejects with note (returns to deferred) -> resubmit -> verified", async () => {
    const api = await as(ctx.student)
    const acctApi = await as(await accountant())

    let res = await api.post(`${ACC_BASE}/${ctx.requestId}/payment`).send(proof())
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Submitted")

    // reject without a note is refused
    res = await acctApi.post(`${ACC_BASE}/${ctx.requestId}/payment-verify`).send({ action: "reject" })
    expect(res.status).toBe(400)

    // SUSPECTED-BUG WATCH: mode was "later", so rejection must restore the
    // DEFERRED status (not bounce all the way back to Payment Requested).
    res = await acctApi
      .post(`${ACC_BASE}/${ctx.requestId}/payment-verify`)
      .send({ action: "reject", note: "UTR not found in bank statement" })
    expect(res.status).toBe(200)
    expect(res.body.data.payment.status).toBe("Rejected")
    expect(res.body.data.status).toBe("Payment Deferred")

    // resubmit from deferred, then verify
    res = await api.post(`${ACC_BASE}/${ctx.requestId}/payment`).send(proof())
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Submitted")

    res = await acctApi.post(`${ACC_BASE}/${ctx.requestId}/payment-verify`).send({ action: "verify" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Verified")
    expect(res.body.data.payment.verifiedAt).toBeTruthy()
  })

  it("supervisor assigns both guests across two rooms; gate checks them in", async () => {
    const supervisorApi = await as(await seed.createUser({ role: "Hostel Supervisor" }))
    const res = await supervisorApi.post(`${ACC_BASE}/${ctx.requestId}/assign-rooms`).send({
      rooms: [
        { roomId: ctx.roomA._id, guestIndexes: [0] },
        { roomId: ctx.roomB._id, guestIndexes: [1] },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rooms Assigned")
    expect(res.body.data.rooms.map((r) => String(r.roomId))).toEqual([
      String(ctx.roomA._id),
      String(ctx.roomB._id),
    ])

    const gateApi = await as(await seed.createUser({ role: "Hostel Gate" }))
    const checkin = await gateApi.post(`${ACC_BASE}/${ctx.requestId}/checkin`)
    expect(checkin.status).toBe(200)
    expect(checkin.body.data.status).toBe("Checked In")
    expect(checkin.body.data.checkInAt).toBeTruthy()
  })

  it("student requests EXTEND; CWO approves WITH extraAmount while the initial payment is verified -> additionalPayments row appears", async () => {
    const api = await as(ctx.student)
    let res = await api.post(`${ACC_BASE}/${ctx.requestId}/schedule-change`).send({
      type: "extend",
      toDate: dateOnly(day(16)),
      reason: "Return flights cancelled",
    })
    expect(res.status).toBe(200)

    const changeId = (
      await as(ctx.student).then((a) => a.get(`${ACC_BASE}/${ctx.requestId}`))
    ).body.data.scheduleChanges.at(-1)._id

    res = await as(await cwo()).then((c) =>
      c.post(`${ACC_BASE}/${ctx.requestId}/schedule-change/${changeId}/decision`).send({
        action: "approve",
        extraAmount: 250,
        note: "Seven extra guest-nights",
      })
    )
    console.log("DECISION-DEBUG", res.status, JSON.stringify(res.body))
    expect(res.status).toBe(200)
    // The initial bill was already VERIFIED, so the extra charge must NOT be
    // folded into it — it opens a second payment row instead.
    expect(res.body.data.payment.amount).toBe(1048) // unchanged
    expect(res.body.data.additionalPayments).toHaveLength(1)
    const addl = res.body.data.additionalPayments[0]
    expect(addl.amount).toBe(250)
    expect(addl.status).toBe("Pending")
    expect(addl.label).toMatch(/[Ee]xtension/)
    ctx.additionalPaymentId = addl._id
  })

  it("student submits proof on the ADDITIONAL payment (additionalPaymentId path); accountant verifies it", async () => {
    const api = await as(ctx.student)
    const acctApi = await as(await accountant())

    let res = await api.post(`${ACC_BASE}/${ctx.requestId}/payment`).send({
      ...proof(),
      additionalPaymentId: ctx.additionalPaymentId,
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/Additional payment submitted/i)
    let addl = res.body.data.additionalPayments.find((p) => p._id === ctx.additionalPaymentId)
    expect(addl.status).toBe("Submitted")
    expect(addl.utr).toBe("123456789012")
    // main payment untouched
    expect(res.body.data.payment.status).toBe("Verified")

    res = await acctApi
      .post(`${ACC_BASE}/${ctx.requestId}/payment-verify`)
      .send({ action: "verify", additionalPaymentId: ctx.additionalPaymentId })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/Additional payment verified/i)
    addl = res.body.data.additionalPayments.find((p) => p._id === ctx.additionalPaymentId)
    expect(addl.status).toBe("Verified")
    expect(addl.verifiedAt).toBeTruthy()
    // workflow stays parked where it was (checked in), nothing else moves
    expect(res.body.data.status).toBe("Checked In")
  })

  it("gate checkout works after the additional bill settles; invoice fetch returns PDF bytes", async () => {
    const gateApi = await as(await seed.createUser({ role: "Hostel Gate" }))
    const api = await as(ctx.student)
    const acctApi = await as(await accountant())

    const checkout = await gateApi.post(`${ACC_BASE}/${ctx.requestId}/checkout`)
    expect(checkout.status).toBe(200)
    expect(checkout.body.data.status).toBe("Checked Out")

    // SUSPECTED BUG (cross-module seam): a fully paid, checked-out booking has
    // NO invoice reachable through any public API. Invoices are only issued by
    // (a) the nightly stay-close cron or (b) mark_paid when the stay is already
    // running — plain portal verification of BOTH payments never generates one,
    // so right after check-out the student's invoice fetch fails.
    let invoice = await api.get(`${ACC_BASE}/${ctx.requestId}/invoice`)
    expect(invoice.status).toBe(400)
    expect(invoice.body.message).toMatch(/no invoice has been generated/i)

    // API-reachable path to the receipt: accountant unsets then manually marks
    // the settled initial bill paid again — the stay is over, so issuing fires.
    const unpaid = await acctApi
      .post(`${ACC_BASE}/${ctx.requestId}/payment-settle`)
      .send({ action: "mark_unpaid", note: "Reconciling before receipt" })
    expect(unpaid.status).toBe(200)
    const paid = await acctApi.post(`${ACC_BASE}/${ctx.requestId}/payment-settle`).send({
      action: "mark_paid",
      method: "Bank transfer reconciled",
      reference: "123456789012",
    })
    expect(paid.status).toBe(200)

    invoice = await api.get(`${ACC_BASE}/${ctx.requestId}/invoice?disposition=attachment`)
    expect(invoice.status).toBe(200)
    expect(invoice.headers["content-type"]).toMatch(/application\/pdf/)
    expect(invoice.headers["content-disposition"]).toMatch(/^attachment;/)
    expect(Number(invoice.headers["content-length"])).toBeGreaterThan(500)
  })
})
