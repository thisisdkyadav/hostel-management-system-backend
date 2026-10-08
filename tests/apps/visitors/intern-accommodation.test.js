import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel, createRoom } from "../../helpers/seed/operations.js"
import { seedHostelSupervisorProfile } from "../../helpers/seed/admin-sw.js"
import {
  registerH4Proof,
  seedH2RoomBooking,
  seedLegacyBookingRequest,
  readH4Notification,
} from "../../helpers/seed/h4.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/intern-accommodation"
const ymd = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const academic = (extra) =>
  seed.createUser({ role: "Academics", email: `h4-faculty-${Date.now()}-${Math.random()}@iiti.ac.in`, ...extra })
const requester = () => academic()
const student = (extra) => ({
  name: "Intern One",
  gender: "Female",
  category: "intern",
  email: "intern@example.com",
  mobile: "9876543210",
  institute: "Research Institute",
  instituteAddress: "Indore",
  course: "BTech",
  department: "Physics",
  payerType: "intern",
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Summer research", checkInTime: "11:00", checkOutTime: "11:00" },
  ...extra,
})
const desks = async () => ({
  office: await as(await seed.admin({ subRole: "Chief Warden Office" })),
  chief: await as(await seed.admin({ subRole: "Chief Warden" })),
  accounts: await as(await seed.admin({ subRole: "Accountant" })),
})
const create = async (api, faculty, extra = {}) => {
  const r = await api
    .post(`${base}/batches`)
    .send({ label: "Research summer batch", facultyUserId: String(faculty._id), students: [student()], ...extra })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body.data.items
}
const action = async (api, r, suffix, body = {}) => {
  const res = await api.post(`${base}/requests/${r._id}/${suffix}`).send({ revision: r.h4.revision, ...body })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.data
}
const approved = async (creatorApi, faculty, desk, extra = {}) => {
  let [r] = await create(creatorApi, faculty, extra)
  if (r.currentStage === "faculty")
    r = await action(await as(faculty), r, "decision/faculty", { action: "approve", confirmPayer: true })
  r = await action(desk.office, r, "decision/office", { action: "approve", confirmAvailability: true })
  r = await action(desk.chief, r, "decision/chief", { action: "approve" })
  return r
}

describe("H4 notification recovery", () => {
  it("accepts today's institute payment date around midnight and refuses tomorrow", async () => {
    const { parsePaidAt } = await import("../../../src/apps/visitors/modules/intern-accommodation/h4.helpers.js")
    const now = new Date("2026-10-03T19:00:00Z") // 4 Oct, 00:30 IST
    expect(parsePaidAt("2026-10-04", now)).toBeInstanceOf(Date)
    expect(parsePaidAt("2026-10-05", now)).toBeNull()
    expect(parsePaidAt("2026-02-30", now)).toBeNull()
    expect(parsePaidAt("2026-10-03T20:00:00Z", now)).toBeNull()
  })
  it("leases notifications, preserves newer changes and retries failed delivery", async () => {
    const f = await academic(),
      api = await as(await requester()),
      facultyApi = await as(f)
    let [r] = await create(api, f)
    const { accommodationOwner } = await import("../../../src/services/accommodation/accommodationOwner.service.js")
    const original = await accommodationOwner.claimH4Notification()
    expect(String(original.requestId)).toBe(r._id)
    expect(await accommodationOwner.claimH4Notification()).toBeNull()
    r = await action(facultyApi, r, "decision/faculty", { action: "approve", confirmPayer: true })
    await accommodationOwner.queueH4Notification(r._id, 0)
    await accommodationOwner.completeH4Notification(original)
    const pending = await readH4Notification(r._id)
    expect(pending.pending).toBe(true)
    expect(pending.revision).toBe(r.h4.revision)
    const updated = await accommodationOwner.claimH4Notification()
    await accommodationOwner.completeH4Notification(updated, "SMTP temporarily unavailable")
    const failed = await readH4Notification(r._id)
    expect(failed.pending).toBe(true)
    expect(failed.lastError).toContain("SMTP")
    expect(failed.nextAttemptAt > new Date()).toBe(true)
    expect(await accommodationOwner.claimH4Notification()).toBeNull()
    await action(facultyApi, r, "resend")
    const retry = await accommodationOwner.claimH4Notification()
    expect(String(retry.requestId)).toBe(r._id)
    await accommodationOwner.completeH4Notification(retry)
    expect((await readH4Notification(r._id)).pending).toBe(false)
  })
})

describe("H4 eligibility, batches and review", () => {
  it("requires login and IIT Academics requester/faculty; permits external intern emails", async () => {
    expect((await (await anon()).get(`${base}/requests`)).status).toBe(401)
    const faculty = await academic(),
      api = await as(await requester())
    expect((await api.get(`${base}/options`)).body.data.canCreate).toBe(true)
    const outsideApi = await as(await academic({ email: `outside-requester-${Date.now()}@example.com` }))
    expect((await outsideApi.get(`${base}/options`)).body.data.canCreate).toBe(false)
    expect(
      (await outsideApi.post(`${base}/batches`).send({ label: "X", facultyUserId: faculty._id, students: [student()] }))
        .status,
    ).toBe(403)
    const outsider = await academic({ email: `outsider-${Date.now()}@example.com` })
    expect(
      (await api.post(`${base}/batches`).send({ label: "X", facultyUserId: outsider._id, students: [student()] }))
        .status,
    ).toBe(400)
    const [r] = await create(api, faculty)
    expect(r.applicantEmail).toBe("intern@example.com")
    expect(r.status).toBe("Pending FA Recommendation")
    expect(r.stageDeadlineAt).toBeNull()
    const other = await as(await academic())
    expect((await other.get(`${base}/requests/${r._id}`)).status).toBe(403)
    expect(
      (
        await other
          .post(`${base}/requests/${r._id}/decision/faculty`)
          .send({ revision: 0, action: "approve", confirmPayer: true })
      ).status,
    ).toBe(403)
    const guestApi = await as(await seed.student())
    expect((await guestApi.get(`/api/v1/accommodation/requests/${r._id}`)).status).toBe(404)
  })
  it.each([
    { role: "Student", subRole: null },
    { role: "Admin", subRole: "Chief Warden Office" },
    { role: "Admin", subRole: "Chief Warden" },
    { role: "Admin", subRole: "Accountant" },
    { role: "Admin", subRole: "HCU" },
    { role: "Super Admin", subRole: null },
    { role: "Warden", subRole: null },
    { role: "Associate Warden", subRole: null },
    { role: "Hostel Supervisor", subRole: null },
    { role: "Hostel Gate", subRole: null },
    { role: "Security", subRole: null },
    { role: "Maintenance Staff", subRole: null },
    { role: "Gymkhana", subRole: "President Gymkhana" },
    { role: "Dining", subRole: "Office" },
    { role: "Dining", subRole: "Caterer" },
  ])("blocks $role ($subRole) from creating requests and drafts even with an IIT email", async ({ role, subRole }) => {
    const faculty = await academic()
    const user = await seed.createUser({ role, subRole, email: `blocked-${Date.now()}-${Math.random()}@iiti.ac.in` })
    const api = await as(user)
    const options = await api.get(`${base}/options`)
    const blockedFromH4 = role === "Dining" && subRole === "Caterer"
    expect(options.status).toBe(blockedFromH4 ? 403 : 200)
    if (!blockedFromH4) expect(options.body.data.canCreate).toBe(false)
    for (const draft of [false, true]) {
      const result = await api.post(`${base}/batches`).send({
        label: "Blocked non-Academics request",
        facultyUserId: String(faculty._id),
        students: [student()],
        draft,
      })
      expect(result.status).toBe(403)
      expect(result.body.success).toBe(false)
      if (!blockedFromH4) expect(result.body.message).toContain("Only IIT Indore Academics users")
    }
  })
  it("creates student-level records atomically and selected Academics creators can recommend", async () => {
    const f = await academic(),
      api = await as(f)
    const rows = await create(api, f, {
      recommend: true,
      students: [student({ payerType: "faculty" }), student({ name: "Intern Two", email: "two@example.com" })],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].h4.batchId).toBe(rows[1].h4.batchId)
    expect(rows[0].status).toBe("Pending CWO Capacity Check")
    expect(rows[0].h4.payer.name).toBe(f.name)
    expect(rows[0].h4.payer.verifiedBy).toBe(String(f._id))
    const bad = await api.post(`${base}/batches`).send({
      label: "Invalid atomic batch",
      facultyUserId: f._id,
      students: [student(), student({ name: "", email: "bad@example.com" })],
    })
    expect(bad.status).toBe(400)
    expect((await api.get(`${base}/requests?search=Invalid%20atomic%20batch`)).body.data.items).toHaveLength(0)
  })
  it("saves incomplete drafts privately and validates every student before submission", async () => {
    const f = await academic(),
      api = await as(await requester()),
      facultyApi = await as(f)
    let [r] = await create(api, f, { draft: true, students: [{ name: "Partial intern" }, {}] })
    expect(r.status).toBe("Draft")
    expect(r.stay.fromDate).toBeUndefined()
    expect((await facultyApi.get(`${base}/requests/${r._id}`)).status).toBe(403)
    expect((await facultyApi.get(`${base}/requests?batchId=${r.h4.batchId}`)).body.data.items).toHaveLength(0)
    const desk = await desks()
    expect((await desk.office.get(`${base}/requests/${r._id}`)).status).toBe(403)
    expect(
      (await desk.office.post(`${base}/requests/${r._id}/cancel`).send({ revision: 0, reason: "Not submitted" }))
        .status,
    ).toBe(403)
    expect(
      (
        await api
          .post(`${base}/requests/${r._id}/edit`)
          .send({ revision: 0, facultyUserId: f._id, student: { name: "Partial intern" } })
      ).status,
    ).toBe(400)
    r = await action(api, r, "edit", { facultyUserId: f._id, student: student() })
    expect(r.status).toBe("Pending FA Recommendation")
    expect((await facultyApi.get(`${base}/requests/${r._id}`)).status).toBe(200)
  })
  it("enforces review stages, payer confirmation, revisions and manual Chief Warden approval", async () => {
    const f = await academic(),
      api = await as(await requester()),
      desk = await desks()
    let [r] = await create(api, f)
    expect(
      (
        await desk.office
          .post(`${base}/requests/${r._id}/decision/office`)
          .send({ revision: 0, action: "approve", confirmAvailability: true })
      ).status,
    ).toBe(400)
    const fa = await as(f)
    expect(
      (await fa.post(`${base}/requests/${r._id}/decision/faculty`).send({ revision: 0, action: "approve" })).status,
    ).toBe(400)
    r = await action(fa, r, "decision/faculty", { action: "approve", confirmPayer: true })
    expect(
      (
        await fa
          .post(`${base}/requests/${r._id}/decision/faculty`)
          .send({ revision: 0, action: "approve", confirmPayer: true })
      ).status,
    ).toBe(409)
    r = await action(desk.office, r, "decision/office", { action: "approve", confirmAvailability: true })
    expect(r.status).toBe("Pending CW Approval")
    expect(r.stageDeadlineAt).toBeNull()
    const { accommodationService } =
      await import("../../../src/apps/visitors/modules/accommodation/accommodation.service.js")
    await accommodationService.autoApproveExpiredChiefWardenRequests()
    expect((await api.get(`${base}/requests/${r._id}`)).body.data.status).toBe("Pending CW Approval")
    r = await action(desk.chief, r, "decision/chief", { action: "request_modification", reason: "Clarify purpose" })
    r = await action(api, r, "edit", {
      facultyUserId: f._id,
      student: student({ stay: { ...student().stay, purpose: "Updated research purpose" } }),
    })
    expect(r.status).toBe("Pending FA Recommendation")
    expect(r.h4.payer.verifiedAt).toBeNull()
  })
})

describe("H4 rooms, payments, stay and invoice", () => {
  it("uses exact arrival/departure times and blocks H2 edits into H4 reservations", async () => {
    const f = await academic(),
      api = await as(f),
      desk = await desks(),
      hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: "701", capacity: 1 })
    const { user: sup } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel }),
      supervisor = await as(sup)
    let first = await approved(api, f, desk, { recommend: true })
    first = await action(desk.office, first, "offer", {
      hostelId: hostel._id,
      mess: "without",
      price: 0,
      gstPercentage: 0,
      reason: "Waiver",
    })
    const preview = (await supervisor.post(`${base}/requests/${first._id}/room-check`).send({ roomNumber: "701" })).body
      .data
    await action(supervisor, first, "assign", { roomNumber: "701", fingerprint: preview.fingerprint })
    const legacy = await seedLegacyBookingRequest({
      userId: f._id,
      hostelId: hostel._id,
      fromDate: ymd(5),
      toDate: ymd(10),
    })
    const legacyApi = await as(sup, { userData: { hostel: { _id: hostel._id, name: hostel.name } } })
    const legacyAllocation = await legacyApi
      .post(`/api/v1/visitor/requests/${legacy._id}/allocate`)
      .send({ allocationData: [["701"]] })
    expect(legacyAllocation.status, JSON.stringify(legacyAllocation.body)).toBe(400)
    expect(legacyAllocation.body.message).toContain("H4 reservation")
    const { getGuestRoomAvailability } =
      await import("../../../src/apps/visitors/modules/accommodation/accommodation.availability.js")
    const window = { hostelId: hostel._id, from: ymd(10), to: ymd(12) }
    expect((await getGuestRoomAvailability(window)).some((r) => String(r.roomId) === String(room._id))).toBe(true)
    expect(
      (await getGuestRoomAvailability({ ...window, checkInTime: "09:00" })).some(
        (r) => String(r.roomId) === String(room._id),
      ),
    ).toBe(false)
    const h2 = await seedH2RoomBooking({
      userId: f._id,
      hostelId: hostel._id,
      roomId: room._id,
      fromDate: ymd(10),
      toDate: ymd(12),
    })
    const edited = await desk.office
      .post(`/api/v1/accommodation/requests/${h2._id}/office-edit`)
      .send({ stay: { fromDate: ymd(10), toDate: ymd(12), checkInTime: "09:00" } })
    expect(edited.status, JSON.stringify(edited.body)).toBe(400)
    expect(edited.body.message).toContain("overlapping H4 reservation")
    let next = await approved(api, f, desk, {
      recommend: true,
      students: [
        student({ email: "next@example.com", stay: { ...student().stay, fromDate: ymd(12), toDate: ymd(14) } }),
      ],
    })
    next = await action(desk.office, next, "offer", {
      hostelId: hostel._id,
      mess: "without",
      price: 0,
      gstPercentage: 0,
      reason: "Waiver",
    })
    const adjacent = (await supervisor.post(`${base}/requests/${next._id}/room-check`).send({ roomNumber: "701" })).body
      .data
    expect(adjacent.warnings).toHaveLength(0)
  })
  it("closes an unpaid stay independently and invoices only after late payment verification", async () => {
    const f = await academic(),
      api = await as(f),
      desk = await desks(),
      hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: "801", capacity: 1 })
    const { user: sup } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel }),
      supervisor = await as(sup)
    let r = await approved(api, f, desk, { recommend: true })
    r = await action(desk.office, r, "offer", { hostelId: hostel._id, mess: "without", price: 100, gstPercentage: 0 })
    r = await action(desk.accounts, r, "settle", {
      action: "mark_paid",
      reason: "Reconciled",
      reference: "BANK-100",
      paidAt: ymd(0),
    })
    const preview = (await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "801" })).body
      .data
    r = await action(supervisor, r, "assign", { roomNumber: "801", fingerprint: preview.fingerprint })
    r = await action(supervisor, r, "checkin")
    r = await action(desk.accounts, r, "settle", { action: "mark_unpaid", reason: "Bank transfer reversed" })
    expect(r.status).toBe("Checked In")
    r = await action(supervisor, r, "checkout")
    expect(r.status).toBe("Checked Out")
    expect(r.invoice.generatedAt).toBeNull()
    r = await action(api, r, "defer")
    expect(r.status).toBe("Checked Out")
    await registerH4Proof(r._id, "media://late-proof")
    r = await action(api, r, "payment", {
      screenshotFileRef: "media://late-proof",
      utr: "123412341234",
      paidAt: ymd(0),
    })
    expect(r.status).toBe("Checked Out")
    await action(desk.accounts, r, "verify", { action: "verify" })
    expect((await api.get(`${base}/requests/${r._id}`)).body.data.status).toBe("Invoiced")
    const { accommodationQueries } = await import("../../../src/services/accommodation/accommodationQueries.service.js")
    expect(
      await accommodationQueries.findReservations({ roomIds: [room._id], from: ymd(5), to: ymd(10) }),
    ).toHaveLength(0)
  })
  it("scopes external links, payment proof and cancellation revocation", async () => {
    const f = await academic(),
      api = await as(await requester()),
      desk = await desks(),
      hostel = await createHostel()
    let r = await approved(api, f, desk)
    expect(
      (
        await desk.office.post(`${base}/requests/${r._id}/offer`).send({
          revision: r.h4.revision,
          hostelId: hostel._id,
          mess: "without",
          price: 200,
          gstPercentage: 0,
          paymentLink: "javascript:alert(1)",
        })
      ).status,
    ).toBe(400)
    r = await action(desk.office, r, "offer", {
      hostelId: hostel._id,
      mess: "without",
      price: 200,
      gstPercentage: 0,
      remarks: "Use the institute accommodation payment portal",
      paymentLink: "https://payments.example.com/accommodation",
    })
    const { h4Notifications } =
      await import("../../../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")
    const internLink = await h4Notifications.accessLink(r, "intern"),
      payerLink = await h4Notifications.accessLink(r, "payer")
    const internToken = internLink.split("/").at(-1),
      payerToken = payerLink.split("/").at(-1),
      anonymous = await anon()
    const view = await anonymous.get(`${base}/access/${internToken}`)
    expect(view.status).toBe(200)
    expect(view.body.data.applicantName).toBe(r.applicantName)
    expect(view.body.data.payment).toBeUndefined()
    expect(view.body.data.h4.facultyEmail).toBeUndefined()
    const { createActionLinkToken } = await import("../../../src/services/action-links/action-link-token.service.js")
    const expired = await createActionLinkToken({
      type: "h4_request_access",
      subjectModel: "AccommodationRequest",
      subjectId: r._id,
      recipientEmail: r.applicantEmail,
      payload: { purpose: "intern" },
      expiresAt: new Date(Date.now() - 60000),
    })
    expect((await anonymous.get(`${base}/access/${expired.rawToken}`)).status).toBe(404)
    expect((await anonymous.get(`${base}/access/not-a-valid-token`)).status).toBe(404)
    expect(
      (await anonymous.post(`${base}/access/${internToken}/payment`).send({ revision: r.h4.revision })).status,
    ).toBe(403)
    expect((await anonymous.get(`${base}/access/${payerToken}`)).body.data.payment.remarks).toBe(
      "Use the institute accommodation payment portal",
    )
    const proof = {
      revision: r.h4.revision,
      utr: "111122223333",
      paidAt: ymd(0),
      screenshotFileRef: "media://unrelated-file",
    }
    expect((await anonymous.post(`${base}/access/${payerToken}/payment`).send(proof)).status).toBe(400)
    await registerH4Proof(r._id, "media://request-proof")
    const submitted = await anonymous
      .post(`${base}/access/${payerToken}/payment`)
      .send({ ...proof, screenshotFileRef: "media://request-proof" })
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
    expect(submitted.body.data.h4.facultyEmail).toBeUndefined()
    expect(submitted.body.data.requesterUserId).toBeUndefined()
    r = submitted.body.data
    expect(r.payment.status).toBe("Submitted")
    expect(
      (await api.post(`${base}/requests/${r._id}/verify`).send({ revision: r.h4.revision, action: "verify" })).status,
    ).toBe(403)
    r = await action(desk.accounts, r, "verify", { action: "reject", reason: "UTR not found" })
    expect(r.payment.status).toBe("Rejected")
    r = await action(desk.office, r, "cancel", { reason: "Withdrawn", refundNote: "Accounts to review separately" })
    expect((await anonymous.get(`${base}/access/${payerToken}`)).status).toBe(404)
    expect((await anonymous.get(`${base}/access/${internToken}`)).status).toBe(404)
    expect(r.payment.utr).toBe("111122223333")
  })
  it("reviews an extension at all three desks, rechecks the reservation and opens an additional payment", async () => {
    const f = await academic(),
      api = await as(f),
      desk = await desks(),
      hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: "601", capacity: 2 })
    const { user: sup } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel }),
      supervisor = await as(sup)
    let r = await approved(api, f, desk, { recommend: true })
    r = await action(desk.office, r, "offer", {
      hostelId: hostel._id,
      mess: "without",
      price: 0,
      gstPercentage: 0,
      reason: "Waiver",
    })
    const initial = (await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "601" })).body
      .data
    r = await action(supervisor, r, "assign", { roomNumber: "601", fingerprint: initial.fingerprint })
    const originalTo = r.stay.toDate
    r = await action(api, r, "schedule", {
      type: "extend",
      fromDate: ymd(5),
      toDate: ymd(12),
      reason: "Research extended",
    })
    expect(r.stay.toDate).toBe(originalTo)
    expect(r.h4.amendment.stage).toBe("faculty")
    r = await action(api, r, "decision/faculty", { action: "approve", confirmPayer: true })
    r = await action(desk.office, r, "decision/office", {
      action: "approve",
      confirmAvailability: true,
      extraAmount: 100,
    })
    expect(
      (
        await desk.chief
          .post(`${base}/requests/${r._id}/decision/chief`)
          .send({ revision: r.h4.revision, action: "approve" })
      ).status,
    ).toBe(409)
    const check = await desk.chief
      .post(`${base}/requests/${r._id}/room-check`)
      .send({ roomNumber: "601", amendment: true })
    expect(check.status).toBe(200)
    r = await action(desk.chief, r, "decision/chief", { action: "approve", fingerprint: check.body.data.fingerprint })
    expect(r.stay.toDate.slice(0, 10)).toBe(ymd(12))
    expect(r.h4.amendment.stage).toBe("")
    expect(r.additionalPayments[0].amount).toBe(100)
    expect((await supervisor.post(`${base}/requests/${r._id}/checkin`).send({ revision: r.h4.revision })).status).toBe(
      400,
    )
    r = await action(desk.accounts, r, "settle", {
      action: "mark_paid",
      additionalPaymentId: r.additionalPayments[0]._id,
      reference: "EXTRA-100",
      paidAt: ymd(0),
      reason: "Reconciled",
    })
    r = await action(supervisor, r, "checkin")
    expect(r.status).toBe("Checked In")
  })
  it("reports partial batch decisions and leaves a stale row untouched", async () => {
    const f = await academic(),
      api = await as(await requester()),
      facultyApi = await as(f)
    const rows = await create(api, f, {
      students: [student(), student({ email: "batch-two@example.com", name: "Batch Two" })],
    })
    await action(facultyApi, rows[0], "decision/faculty", { action: "approve", confirmPayer: true })
    const result = await facultyApi.post(`${base}/batch-decision`).send({
      stage: "faculty",
      action: "approve",
      confirmPayer: true,
      requests: rows.map((r) => ({ id: r._id, revision: 0 })),
    })
    expect(result.status).toBe(200)
    expect(result.body.data.results.map((r) => r.success)).toEqual([false, true])
    expect(result.body.data.results[0].statusCode).toBe(409)
  })
  it("runs approvals through payment, warning override, room move, gate checkout and faculty invoice", async () => {
    const f = await academic(),
      api = await as(f),
      desk = await desks()
    const hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: "401", occupancy: 1, capacity: 2 })
    const second = await createRoom({ hostelId: hostel._id, roomNumber: "402", capacity: 2 })
    const { user: sup } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel })
    const supervisor = await as(sup)
    let r = await approved(api, f, desk, { recommend: true, students: [student({ payerType: "faculty" })] })
    r = await action(desk.office, r, "offer", { hostelId: hostel._id, mess: "with", price: 1000, gstPercentage: 18 })
    expect(r.payment.amount).toBe(1180)
    expect(
      (await supervisor.post(`${base}/requests/${r._id}/assign`).send({ revision: r.h4.revision, roomNumber: "401" }))
        .status,
    ).toBe(400)
    r = await action(api, r, "defer")
    expect(
      (await supervisor.post(`${base}/requests/${r._id}/assign`).send({ revision: r.h4.revision, roomNumber: "401" }))
        .status,
    ).toBe(400)
    r = await action(desk.accounts, r, "settle", {
      action: "mark_paid",
      reference: "BANK-123",
      paidAt: ymd(0),
      reason: "Received and reconciled",
    })
    expect(r.status).toBe("Payment Verified")
    const preview = await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "401" })
    expect(preview.status, JSON.stringify(preview.body)).toBe(200)
    expect(preview.body.data.warnings.some((w) => w.kind === "resident")).toBe(true)
    expect(
      (
        await supervisor
          .post(`${base}/requests/${r._id}/assign`)
          .send({ revision: r.h4.revision, roomNumber: "401", fingerprint: preview.body.data.fingerprint })
      ).status,
    ).toBe(400)
    r = await action(supervisor, r, "assign", {
      roomNumber: "401",
      fingerprint: preview.body.data.fingerprint,
      acknowledged: true,
      overrideReason: "Resident is away; supervisor confirmed bed",
    })
    expect(r.status).toBe("Rooms Assigned")
    expect(r.h4.roomHistory[0].warnings.some((w) => w.kind === "resident")).toBe(true)
    const otherHostel = await createHostel()
    const { user: otherSup } = await seedHostelSupervisorProfile({ hostels: [otherHostel], activeHostel: otherHostel })
    expect((await (await as(otherSup)).get(`${base}/requests/${r._id}`)).status).toBe(403)
    r = await action(supervisor, r, "checkin")
    const move = await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "402" })
    r = await action(supervisor, r, "assign", {
      roomNumber: "402",
      fingerprint: move.body.data.fingerprint,
      overrideReason: "Move to a vacant room",
    })
    expect(r.status).toBe("Checked In")
    expect(r.rooms[0].roomId).toBe(String(second._id))
    r = await action(supervisor, r, "checkout")
    const closed = (await api.get(`${base}/requests/${r._id}`)).body.data
    expect(closed.status).toBe("Invoiced")
    expect(closed.invoice.number).toBeTruthy()
    const pdf = await api.get(`${base}/requests/${r._id}/invoice`)
    expect(pdf.status).toBe(200)
    expect(pdf.headers["content-type"]).toContain("application/pdf")
    const { buildInvoiceModel } =
      await import("../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
    expect(buildInvoiceModel({ request: closed }).requestedBy).toBe(f.name)
    const { hostelQueries } = await import("../../../src/services/hostel/hostelQueries.service.js")
    const unchanged = await hostelQueries.findRoomById(room._id)
    expect(unchanged.status).toBe("Active")
    expect(unchanged.occupancy).toBe(1)
    expect(unchanged.capacity).toBe(2)
  })
  it("protects room commits from stale warnings and keeps normal guest rooms restrictive", async () => {
    const f = await academic(),
      api = await as(f),
      desk = await desks(),
      hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: "501", capacity: 2 })
    const { user: sup } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel })
    const supervisor = await as(sup)
    const ready = async (name) => {
      let r = await approved(api, f, desk, { recommend: true, students: [student({ name })] })
      return action(desk.office, r, "offer", {
        hostelId: hostel._id,
        mess: "without",
        price: 0,
        gstPercentage: 0,
        reason: "Approved waiver",
      })
    }
    let a = await ready("First intern"),
      b = await ready("Second intern")
    const firstPreview = (await supervisor.post(`${base}/requests/${a._id}/room-check`).send({ roomNumber: "501" }))
      .body.data
    const stale = (await supervisor.post(`${base}/requests/${b._id}/room-check`).send({ roomNumber: "501" })).body.data
    a = await action(supervisor, a, "assign", { roomNumber: "501", fingerprint: firstPreview.fingerprint })
    expect(
      (
        await supervisor
          .post(`${base}/requests/${b._id}/assign`)
          .send({ revision: b.h4.revision, roomNumber: "501", fingerprint: stale.fingerprint })
      ).status,
    ).toBe(409)
    const fresh = (await supervisor.post(`${base}/requests/${b._id}/room-check`).send({ roomNumber: "501" })).body.data
    expect(fresh.warnings.some((w) => w.kind === "intern")).toBe(true)
    b = await action(supervisor, b, "assign", {
      roomNumber: "501",
      fingerprint: fresh.fingerprint,
      acknowledged: true,
      overrideReason: "Confirmed shared occupancy",
    })
    const { getGuestRoomAvailability } =
      await import("../../../src/apps/visitors/modules/accommodation/accommodation.availability.js")
    const available = await getGuestRoomAvailability({
      hostelId: hostel._id,
      from: student().stay.fromDate,
      to: student().stay.toDate,
    })
    expect(available.some((r) => String(r.roomId) === String(room._id))).toBe(false)
    b = await action(desk.office, b, "cancel", {
      reason: "Intern no longer arriving",
      refundNote: "No refund for waiver",
    })
    expect(b.status).toBe("Cancelled")
    const { accommodationQueries } = await import("../../../src/services/accommodation/accommodationQueries.service.js")
    const reservations = await accommodationQueries.findReservations({ roomIds: [room._id], from: ymd(5), to: ymd(10) })
    expect(reservations).toHaveLength(1)
  })
})
