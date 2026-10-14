import { describe, it, expect, beforeAll, afterAll } from "vitest"
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
const student = (payerType = "faculty") => ({
  name: "Research student", gender: "Male", category: "intern", email: "research@example.com",
  mobile: "9876543210", institute: "Institute", instituteAddress: "Indore", course: "BTech", department: "Physics", payerType,
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Research", checkInTime: "11:00", checkOutTime: "11:00" },
})
const action = async (api, r, suffix, extra = {}) => {
  const result = await api.post(`${base}/requests/${r._id}/${suffix}`).send({ revision: r.h4.revision, ...extra })
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body.data
}

describe("H4 academic categories and separate payments", () => {
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
    r = await action(await as(professor), r, "decision/faculty", { action: "approve", confirmPayer: true })
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
    expect((await office.put(settingsPath).send({ value: { accommodationPaymentLink: "javascript:alert(1)" } })).status).toBe(400)
    const value = { accommodationPaymentLink: "payments.example.com/hostel", messPaymentLink: "payments.example.com/mess", gstPercentage: 18, accommodationDailyRate: 100, messDailyRate: 50 }
    expect((await office.put(settingsPath).send({ value })).status).toBe(200)
    expect((await office.get(settingsPath)).body.value.accommodationPaymentLink).toBe("https://payments.example.com/hostel")
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
    expect(r.payment.amount).toBe(590)
    expect(r.payment.paymentLink).toBe("https://payments.example.com/hostel")
    expect(r.h4.messPayment).toMatchObject({ dailyRate: 50, days: 5, calculatedAmount: 250, amount: 250, amountOverridden: false, paymentLink: "https://payments.example.com/mess" })
    expect((await office.put(settingsPath).send({ value: { ...value, messDailyRate: 90 } })).status).toBe(200)
    expect((await api.get(`${base}/requests/${initial._id}`)).body.data.h4.messPayment.amount).toBe(250)
    r = await ready()
    r = await action(office, r, "offer", { hostelId: hostel._id, mess: "with", accommodationDailyRate: 120, price: 550, messDailyRate: 60, messAmount: 275 })
    expect(r.h4.accommodationCalculatedAmount).toBe(600)
    expect(r.h4.accommodationAmountOverridden).toBe(true)
    expect(r.payment.amount).toBe(649)
    const { buildInvoiceModel } = await import("../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
    expect(buildInvoiceModel({ request: r }).rows[0].tariff).toBe("110.00")
    expect(r.h4.messPayment).toMatchObject({ dailyRate: 60, calculatedAmount: 300, amount: 275, amountOverridden: true })
  })

  it.each(["faculty", "intern"])("keeps mess paid by the student, with accommodation paid by %s and invoiced only after checkout", async (payerType) => {
    const professor = await academic()
    const api = await as(professor)
    const office = await as(await seed.admin({ subRole: "Chief Warden Office" }))
    const chief = await as(await seed.admin({ subRole: "Chief Warden" }))
    const accounts = await as(await seed.admin({ subRole: "Accountant" }))
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: "601", capacity: 2 })
    const { user: supervisorUser } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel })
    const supervisor = await as(supervisorUser)
    const creation = await api.post(`${base}/batches`).send({ students: [student(payerType)], recommend: true })
    expect(creation.status).toBe(201)
    let r = creation.body.data.items[0]
    r = await action(office, r, "decision/office", { action: "approve", confirmAvailability: true })
    r = await action(chief, r, "decision/chief", { action: "approve" })
    expect((await office.put("/api/v1/config/internAccommodation").send({ value: { gstPercentage: 18, accommodationPaymentLink: "payments.example.com/hostel", messPaymentLink: "https://payments.example.com/mess" } })).status).toBe(200)
    r = await action(office, r, "offer", {
      hostelId: hostel._id, mess: "with", price: 100, gstPercentage: 18, messAmount: 250,
      paymentLink: "payments.example.com/hostel", messPaymentLink: "https://payments.example.com/mess",
    })
    expect(r.payment.paymentLink).toBe("https://payments.example.com/hostel")
    expect(r.payment.amount).toBe(118)
    expect(r.h4.messPayment.amount).toBe(250)
    const { h4Notifications } = await import("../../../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")
    const token = async (purpose) => (await h4Notifications.accessLink(r, purpose)).split("/").at(-1)
    const internPath = `${base}/access/${await token("intern")}`
    const payerPath = `${base}/access/${await token("payer")}`
    const external = await anon()
    const internView = (await external.get(internPath)).body.data
    expect(internView.payment).toBeUndefined()
    expect(internView.h4.messPayment.amount).toBe(250)
    const payerView = (await external.get(payerPath)).body.data
    expect(payerView.payment.amount).toBe(118)
    if (payerType === "faculty") expect(payerView.h4.messPayment).toBeUndefined()
    expect((await external.post(`${internPath}/payment`).send({ revision: r.h4.revision })).status).toBe(403)
    if (payerType === "faculty")
      expect((await external.post(`${payerPath}/payment`).send({ revision: r.h4.revision, paymentType: "mess" })).status).toBe(403)
    expect((await external.get(`${payerPath}/invoice`)).status).toBe(404)
    await registerH4Proof(r._id, "hostel-proof")
    r = await action(api, r, "payment", { utr: "123456789012", paidAt: ymd(), screenshotFileRef: "hostel-proof" })
    r = await action(accounts, r, "verify", { action: "verify" })
    expect(r.status).not.toBe("Payment Verified")
    expect((await supervisor.post(`${base}/requests/${r._id}/assign`).send({ revision: r.h4.revision, roomNumber: "601" })).status).toBe(400)
    await registerH4Proof(r._id, "mess-proof")
    const submitted = await external.post(`${internPath}/payment`).send({ revision: r.h4.revision, paymentType: "mess", utr: "999999999999", paidAt: ymd(), screenshotFileRef: "mess-proof" })
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200)
    r = (await api.get(`${base}/requests/${r._id}`)).body.data
    expect((await accounts.get(`${base}/requests`).query({ queue: "payments" })).body.data.items.some((item) => item._id === r._id)).toBe(true)
    r = await action(accounts, r, "verify", { action: "reject", paymentType: "mess", reason: "Unreadable proof" })
    expect(r.h4.messPayment.status).toBe("Rejected")
    const retry = await external.post(`${internPath}/payment`).send({ revision: r.h4.revision, paymentType: "mess", utr: "999999999999", paidAt: ymd(), screenshotFileRef: "mess-proof" })
    expect(retry.status).toBe(200)
    r = (await api.get(`${base}/requests/${r._id}`)).body.data
    // Verifying mess needs a dining caterer; the student is told where to collect the mess card.
    const [{ caterer }, { caterer: other }] = [await catererFixture(), await catererFixture()]
    expect((await accounts.get(`${base}/options`)).body.data.caterers.some((c) => String(c._id) === String(caterer._id))).toBe(true)
    expect((await accounts.post(`${base}/requests/${r._id}/verify`).send({ revision: r.h4.revision, action: "verify", paymentType: "mess" })).status).toBe(400)
    r = await action(accounts, r, "verify", { action: "verify", paymentType: "mess", catererId: caterer._id })
    expect(r.status).toBe("Payment Verified")
    expect(r.h4.caterer.name).toBe(caterer.name)
    expect((await api.post(`${base}/requests/${r._id}/caterer`).send({ revision: r.h4.revision, catererId: other._id })).status).toBe(403)
    r = await action(accounts, r, "caterer", { catererId: other._id })
    expect(r.h4.caterer.name).toBe(other.name)
    expect((await external.get(internPath)).body.data.h4.caterer.name).toBe(other.name)
    const studentEmail = (await h4Notifications.messages(r)).find((m) => m.to === r.applicantEmail)
    expect(studentEmail.body).toContain(`Mess caterer: <strong>${other.name}</strong>`)
    expect(studentEmail.body).toContain("hostel office")
    expect(studentEmail.body).toContain("Mess payment received: ₹250.00")
    expect(studentEmail.body).toContain("Accommodation payment received: ₹118.00")
    expect(studentEmail.attachments).toHaveLength(0)
    expect(r.invoice?.generatedAt).toBeFalsy()
    const preview = await supervisor.post(`${base}/requests/${r._id}/room-check`).send({ roomNumber: "601" })
    r = await action(supervisor, r, "assign", { roomNumber: "601", fingerprint: preview.body.data.fingerprint })
    r = await action(supervisor, r, "checkin")
    r = await action(supervisor, r, "checkout")
    r = (await api.get(`${base}/requests/${r._id}`)).body.data
    expect(r.status).toBe("Invoiced")
    const { buildInvoiceModel, listSettledPayments } = await import("../../../src/apps/visitors/modules/accommodation/accommodation.invoice-pdf.js")
    const model = buildInvoiceModel({ request: r })
    expect(listSettledPayments(r).reduce((sum, p) => sum + p.amount, 0)).toBe(118)
    expect(model.utr).not.toContain("999999999999")
    expect(model.requestedBy).toBe(payerType === "faculty" ? professor.name : r.applicantName)
    const messages = await h4Notifications.messages(r)
    expect(messages.find((m) => m.to === r.h4.payer.email).attachments).toHaveLength(1)
    expect((await external.get(`${payerPath}/invoice`)).status).toBe(200)
    expect((await external.get(`${internPath}/invoice`)).status).toBe(403)
  })
})
