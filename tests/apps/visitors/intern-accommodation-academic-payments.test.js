import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel, createRoom } from "../../helpers/seed/operations.js"
import { seedHostelSupervisorProfile } from "../../helpers/seed/admin-sw.js"
import { registerH4Proof } from "../../helpers/seed/h4.js"
import { catererFixture } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/intern-accommodation"
const ymd = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const academic = (extra = {}) => seed.createUser({ role: "Academics", email: `h4-${Date.now()}-${Math.random()}@iiti.ac.in`, ...extra })
const student = () => ({
  name: "Research student", gender: "Male", category: "intern", email: "research@example.com",
  mobile: "9876543210", institute: "Institute", instituteAddress: "Indore", course: "BTech", department: "Physics",
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Research", checkInTime: "11:00", checkOutTime: "11:00" },
})
const action = async (api, r, suffix, extra = {}) => {
  const result = await api.post(`${base}/requests/${r._id}/${suffix}`).send({ revision: r.h4.revision, ...extra })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body.data
}

describe("H4 academic categories and the combined student payment", () => {
  it("defaults Personal users to themselves and creates without a batch title", async () => {
    const professor = await academic()
    const other = await academic()
    const api = await as(professor)
    const options = (await api.get(`${base}/options`)).body.data
    expect(options.academicCategory).toBe("personal")
    expect(options.defaultFacultyUserId).toBe(String(professor._id))
    const result = await api.post(`${base}/batches`).send({ facultyUserId: other._id, students: [student()], recommend: true })
    expect(result.status, JSON.stringify(result.body)).toBe(201)
    const r = result.body.data.items[0]
    expect(r.h4.facultyUserId).toBe(String(professor._id))
    expect(r.h4.batchLabel).toBe("")
    expect(result.body.data.batch.label).toBe("")
    expect(r.status).toBe("Pending CWO Capacity Check")
  })

  it("Office users must select a Personal professor and cannot recommend on their behalf", async () => {
    const office = await academic({ academicCategory: "office" })
    const professor = await academic()
    const api = await as(office)
    const options = (await api.get(`${base}/options`)).body.data
    expect(options.canRecommend).toBe(false)
    expect(options.defaultFacultyUserId).toBeNull()
    expect(options.faculty.some((f) => String(f._id) === String(office._id))).toBe(false)
    expect((await api.post(`${base}/batches`).send({ students: [student()] })).status).toBe(400)
    expect((await api.post(`${base}/batches`).send({ facultyUserId: office._id, students: [student()] })).status).toBe(400)
    expect((await api.post(`${base}/batches`).send({ facultyUserId: professor._id, students: [student()], recommend: true })).status).toBe(403)
    const result = await api.post(`${base}/batches`).send({ facultyUserId: professor._id, students: [student()] })
    expect(result.status).toBe(201)
    let r = result.body.data.items[0]
    expect(r.status).toBe("Pending FA Recommendation")
    r = await action(await as(professor), r, "decision/faculty", { action: "approve" })
    expect(r.status).toBe("Pending CWO Capacity Check")
  })

  it("restricts settings access and calculates daily charges with independent overrides", async () => {
    const professor = await academic()
    const api = await as(professor)
    const office = await as(await seed.admin({ subRole: "Chief Warden Office" }))
    const chief = await as(await seed.admin({ subRole: "Chief Warden" }))
    const hostel = await createHostel()
    const settingsPath = "/api/v1/config/internAccommodation"
    expect((await api.get(settingsPath)).status).toBe(403)
    expect((await chief.get(settingsPath)).status).toBe(403)
    expect((await office.put(settingsPath).send({ value: { gstPercentage: 101 } })).status).toBe(400)
    expect((await office.put(settingsPath).send({ value: { messDailyRate: -10 } })).status).toBe(400)
    expect((await office.put(settingsPath).send({ value: { paymentLink: "javascript:alert(1)" } })).status).toBe(400)
    const value = { paymentLink: "payments.example.com/hostel", gstPercentage: 18, accommodationDailyRate: 100, messDailyRate: 50 }
    expect((await office.put(settingsPath).send({ value })).status).toBe(200)
    expect((await office.get(settingsPath)).body.value.paymentLink).toBe("https://payments.example.com/hostel")
    expect((await office.get(settingsPath)).body.value.messPaymentLink).toBeUndefined()
    expect((await office.get(`${base}/options`)).body.data.config.messDailyRate).toBe(50)
    const ready = async () => {
      const data = student()
      data.stay.checkInTime = "09:00"
      data.stay.checkOutTime = "19:00"
      const creation = await api.post(`${base}/batches`).send({ students: [data], recommend: true })
      expect(creation.status).toBe(201)
      let r = creation.body.data.items[0]
      expect(r.stay.checkInTime).toBe("00:00")
      expect(r.stay.checkOutTime).toBe("00:00")
      expect(r.stay.earlyCheckInHours).toBe(0)
      expect(r.stay.lateCheckOutHours).toBe(0)
      r = await action(office, r, "decision/office", { action: "approve", confirmAvailability: true })
      return action(chief, r, "decision/chief", { action: "approve" })
    }
    let r = await ready()
    const initial = r
    expect((await office.post(`${base}/requests/${r._id}/offer`).send({ revision: r.h4.revision, hostelId: hostel._id, mess: "with", messDailyRate: -1 })).status).toBe(400)
    r = await action(office, r, "offer", { hostelId: hostel._id, mess: "with", gstPercentage: 99, paymentLink: "https://wrong.example.com" })
    expect(r.nights).toBe(5)
    expect(r.quote.subtotal).toBe(500)
    expect(r.quote.gstPercentage).toBe(18)
    // One bill: 500 + 18% GST + 250 mess.
    expect(r.payment.amount).toBe(840)
    expect(r.payment.paymentLink).toBe("https://payments.example.com/hostel")
    expect(r.h4.messCharge).toMatchObject({ dailyRate: 50, days: 5, calculatedAmount: 250, amount: 250, amountOverridden: false })
    expect((await office.put(settingsPath).send({ value: { ...value, messDailyRate: 90 } })).status).toBe(200)
    expect((await api.get(`${base}/requests/${initial._id}`)).body.data.h4.messCharge.amount).toBe(250)
    r = await ready()
    r = await action(office, r, "offer", { hostelId: hostel._id, mess: "with", accommodationDailyRate: 120, price: 550, messDailyRate: 60, messAmount: 275 })
    expect(r.h4.accommodationCalculatedAmount).toBe(600)
    expect(r.h4.accommodationAmountOverridden).toBe(true)
    expect(r.payment.amount).toBe(924)
    const { buildInvoiceModel } = await import("../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
    const rows = buildInvoiceModel({ request: r }).rows
    expect(rows[0].tariff).toBe("110.00")
    expect(rows[1]).toMatchObject({ tariff: "60.00", gst: "0.00", total: "275.00" })
    expect(r.h4.messCharge).toMatchObject({ dailyRate: 60, calculatedAmount: 300, amount: 275, amountOverridden: true })
  })

  it("bills accommodation and mess to the student once; caterer then approved mess photo before rooms", async () => {
    const professor = await academic()
    const api = await as(professor)
    const officeUser = await seed.admin({ subRole: "Chief Warden Office" })
    const office = await as(officeUser)
    const chief = await as(await seed.admin({ subRole: "Chief Warden" }))
    const accounts = await as(await seed.admin({ subRole: "Accountant" }))
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: "601", capacity: 2 })
    const { user: supervisorUser } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel })
    const supervisor = await as(supervisorUser)
    // A legacy payer choice is ignored: the student always pays.
    const creation = await api.post(`${base}/batches`).send({ students: [{ ...student(), payerType: "faculty" }], recommend: true })
    expect(creation.status).toBe(201)
    let r = creation.body.data.items[0]
    expect(r.h4.payer).toMatchObject({ type: "intern", email: "research@example.com" })
    r = await action(office, r, "decision/office", { action: "approve", confirmAvailability: true })
    r = await action(chief, r, "decision/chief", { action: "approve" })
    expect((await office.put("/api/v1/config/internAccommodation").send({ value: { gstPercentage: 18, paymentLink: "payments.example.com/hostel" } })).status).toBe(200)
    r = await action(office, r, "offer", { hostelId: hostel._id, mess: "with", price: 100, messAmount: 250 })
    expect(r.payment).toMatchObject({ amount: 368, status: "Pending", paymentLink: "https://payments.example.com/hostel" })
    expect(r.h4.messCharge.amount).toBe(250)
    expect(r.additionalPayments).toHaveLength(0)

    const { h4Notifications } = await import("../../../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")
    let messages = await h4Notifications.messages(r)
    const links = messages.flatMap((m) => [...m.body.matchAll(/intern-accommodation\/access\/([^"]+)/g)].map((x) => ({ to: m.to, token: x[1] })))
    expect(links.map((l) => l.to)).toEqual([r.applicantEmail])
    // The professor (creator and faculty) has nothing to act on: they are copied
    // on the student's letter instead of getting a separate status email.
    expect(messages.find((m) => m.to === professor.email)).toBeUndefined()
    const letter = messages.find((m) => m.to === r.applicantEmail)
    expect(letter).toMatchObject({ cc: professor.email, useTemplate: false })
    expect(letter.subject).toBe("Accommodation approved: charges and payment link – IIT Indore hostel accommodation")
    const studentMail = letter.body
    expect(studentMail).toContain(`in <strong>${hostel.name}</strong>, on a double occupancy basis`)
    expect(studentMail).toContain("<li>One Almirah</li>")
    expect(studentMail).toContain("Rs. 118/-")
    expect(studentMail).toContain("including GST at 18%")
    expect(studentMail).toContain("Rs. 250/-")
    expect(studentMail).toContain("Rs. 368/-")
    expect(studentMail).toContain("strictly non-refundable")
    expect(studentMail).toContain("https://payments.example.com/hostel")
    expect(studentMail).toContain("Opens payments.example.com")
    expect(studentMail).toContain("About this email")
    const internPath = `${base}/access/${links[0].token}`
    const external = await anon()
    const view = (await external.get(internPath)).body.data
    expect(view.payment.amount).toBe(368)
    expect(view.h4.messCharge.amount).toBe(250)
    expect(view.quote.total).toBe(118)
    expect((await external.get(`${internPath}/invoice`)).status).toBe(404)

    await registerH4Proof(r._id, "combined-proof")
    const paid = await external.post(`${internPath}/payment`).send({ revision: r.h4.revision, utr: "123456789012", paidAt: ymd(), screenshotFileRef: "combined-proof" })
    expect(paid.status, JSON.stringify(paid.body)).toBe(200)
    r = (await api.get(`${base}/requests/${r._id}`)).body.data
    expect(r.payment.status).toBe("Submitted")
    expect((await accounts.get(`${base}/requests`).query({ queue: "payments" })).body.data.items.some((item) => item._id === r._id)).toBe(true)

    // Verifying a with-mess stay needs a caterer; Accounts sees this month's load per caterer.
    const [{ caterer }, { caterer: other }] = [await catererFixture(), await catererFixture()]
    const { DiningPeriod } = await import("../../../src/models/index.js")
    const today = new Date(`${ymd()}T00:00:00Z`)
    await DiningPeriod.create({
      startDate: new Date(+today - 5 * 86400000), endDate: new Date(+today + 20 * 86400000), registrationEnabled: false,
      catererIds: [caterer._id, other._id], catererCapacities: [{ catererId: caterer._id, maxStudentCount: 300 }],
    })
    let catererRows = (await accounts.get(`${base}/options`)).body.data.caterers
    expect(catererRows.find((c) => String(c._id) === String(caterer._id))).toMatchObject({ capacity: 300, allocated: 0, interns: 0 })
    expect(catererRows.find((c) => String(c._id) === String(other._id)).capacity).toBeNull()
    expect((await accounts.post(`${base}/requests/${r._id}/verify`).send({ revision: r.h4.revision, action: "verify" })).status).toBe(400)
    r = await action(accounts, r, "verify", { action: "verify", catererId: caterer._id })
    expect(r.status).toBe("Payment Verified")
    expect(r.h4.caterer.name).toBe(caterer.name)
    expect(r.h4.messPhoto.status).toBe("Pending")
    catererRows = (await accounts.get(`${base}/options`)).body.data.caterers
    expect(catererRows.find((c) => String(c._id) === String(caterer._id)).interns).toBe(1)
    r = await action(accounts, r, "caterer", { catererId: other._id })
    expect(r.h4.caterer.name).toBe(other.name)

    // No room until CW Office approves the student's photo.
    expect((await supervisor.get(`${base}/requests`).query({ queue: "rooms" })).body.data.items.some((i) => i._id === r._id)).toBe(false)
    const blocked = await supervisor.post(`${base}/requests/${r._id}/assign`).send({ revision: r.h4.revision, roomNumber: "601" })
    expect(blocked.status).toBe(400)
    expect(blocked.body.message).toContain("mess photo")
    messages = await h4Notifications.messages(r)
    const photoLetter = messages.find((m) => m.to === r.applicantEmail)
    expect(photoLetter.subject).toContain("upload your mess photo")
    expect(photoLetter.body).toContain(`your mess is <strong>${other.name}</strong>`)
    expect(photoLetter.body).toContain("Upload your photo")
    expect(photoLetter.body).not.toContain("hostel office")

    const { storageClient } = await import("../../../src/services/storage/storage.client.js")
    const { fileAccessService } = await import("../../../src/services/storage/file-access.service.js")
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])
    const upload = vi.spyOn(storageClient, "upload").mockResolvedValue({ file_ref: "media://mess-photo-1" })
    const read = vi.spyOn(fileAccessService, "getBuffer").mockResolvedValue({ buffer: jpeg, contentType: "image/jpeg" })
    try {
      expect((await external.post(`${internPath}/photo`).field("revision", String(r.h4.revision)).attach("image", Buffer.from("nope"), "a.txt")).status).toBe(400)
      let sent = await external.post(`${internPath}/photo`).field("revision", String(r.h4.revision)).attach("image", jpeg, "me.jpg")
      expect(sent.status, JSON.stringify(sent.body)).toBe(200)
      expect(upload.mock.calls.at(-1)[0].policy).toBe("dining-bio-photo")
      expect(sent.body.data.h4.messPhoto).toMatchObject({ status: "Submitted", hasFile: true })
      expect((await external.get(`${internPath}/photo`)).status).toBe(200)
      r = (await office.get(`${base}/requests/${r._id}`)).body.data
      expect((await office.get(`${base}/requests`).query({ queue: "photos" })).body.data.items.some((i) => i._id === r._id)).toBe(true)
      expect((await office.get(`${base}/requests/${r._id}/photo`)).status).toBe(200)
      expect((await accounts.post(`${base}/requests/${r._id}/photo-review`).send({ revision: r.h4.revision, action: "approve" })).status).toBe(403)
      expect((await office.post(`${base}/requests/${r._id}/photo-review`).send({ revision: r.h4.revision, action: "reject" })).status).toBe(400)
      r = await action(office, r, "photo-review", { action: "reject", reason: "Face not visible" })
      expect(r.h4.messPhoto.status).toBe("Rejected")
      expect((await h4Notifications.messages(r)).find((m) => m.to === r.applicantEmail).body).toContain("Your mess photo was not accepted: <strong>Face not visible</strong>")
      sent = await external.post(`${internPath}/photo`).field("revision", String(r.h4.revision)).attach("image", jpeg, "me.jpg")
      expect(sent.status).toBe(200)
      r = (await office.get(`${base}/requests/${r._id}`)).body.data
      r = await action(office, r, "photo-review", { action: "approve" })
      expect(r.h4.messPhoto.status).toBe("Approved")
      expect((await external.post(`${internPath}/photo`).field("revision", String(r.h4.revision)).attach("image", jpeg, "me.jpg")).status).toBe(400)
    } finally {
      upload.mockRestore()
      read.mockRestore()
    }
    expect((await supervisor.get(`${base}/requests`).query({ queue: "rooms" })).body.data.items.some((i) => i._id === r._id)).toBe(true)
    const preview = await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "601" })
    r = await action(supervisor, r, "assign", { roomNumber: "601", fingerprint: preview.body.data.fingerprint })
    r = await action(supervisor, r, "checkin")
    r = await action(supervisor, r, "checkout")
    r = (await api.get(`${base}/requests/${r._id}`)).body.data
    expect(r.status).toBe("Invoiced")
    const { buildInvoiceModel, listSettledPayments } = await import("../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
    const model = buildInvoiceModel({ request: r })
    expect(listSettledPayments(r).reduce((sum, p) => sum + p.amount, 0)).toBe(368)
    expect(model.total).toBe(368)
    expect(model.rows.map((row) => row.total)).toEqual(["118.00", "250.00"])
    expect(model.requestedBy).toBe(r.applicantName)
    expect(model.source).toBe("Self")
    messages = await h4Notifications.messages(r)
    expect(messages.find((m) => m.to === r.applicantEmail).attachments).toHaveLength(1)
    expect((await external.get(`${internPath}/invoice`)).status).toBe(200)
  })
})
