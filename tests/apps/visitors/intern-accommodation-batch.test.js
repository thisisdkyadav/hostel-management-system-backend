import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel } from "../../helpers/seed/operations.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/intern-accommodation"
const ymd = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const student = (i, gender = "Male") => ({
  name: `Batch intern ${i}`, gender, category: "intern", email: `batch${i}-${Date.now()}@example.com`,
  mobile: "9876543210", institute: "Institute", instituteAddress: "Indore", course: "BTech", department: "Physics", payerType: "intern",
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Research" },
})
const asStudent = (r) => ({
  name: r.applicantName, gender: r.h4.gender, category: r.h4.category, email: r.applicantEmail, mobile: r.applicantPhone,
  institute: r.h4.institute, instituteAddress: r.h4.instituteAddress, course: r.h4.course, department: r.h4.department,
  payerType: r.h4.payer.type, stay: { fromDate: ymd(5), toDate: ymd(10), purpose: r.stay.purpose },
})
const models = () => import("../../../src/models/index.js")
const notifications = async () =>
  (await import("../../../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")).h4Notifications

describe("H4 bulk actions", () => {
  it("sends one digest per internal recipient for bulk create, decisions and charges", async () => {
    const professor = await seed.createUser({ role: "Academics", email: `h4-batch-${Date.now()}@iiti.ac.in` })
    const officeUser = await seed.admin({ subRole: "Chief Warden Office" })
    const chiefUser = await seed.admin({ subRole: "Chief Warden" })
    const api = await as(professor)
    const office = await as(officeUser)
    const chief = await as(chiefUser)
    const h4 = await notifications()
    const { AccommodationDigest, AccommodationNotification } = await models()

    const created = await api.post(`${base}/batches`).send({ students: [student(1), student(2, "Female"), student(3)], recommend: true })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    let items = created.body.data.items
    const ids = items.map((r) => String(r._id))
    const jobs = await AccommodationNotification.find({ requestId: { $in: ids } }).lean()
    expect(jobs.every((j) => j.internalDigest)).toBe(true)
    // Per-request emails then skip the creator and the CW Office queue.
    expect((await h4.messages(items[0], { skipInternal: true })).map((m) => m.to)).not.toContain(professor.email)

    let digest = await AccommodationDigest.findOne({ requestIds: { $all: ids } }).sort({ createdAt: -1 }).lean()
    expect(digest.note).toContain("submitted 3 requests")
    let mails = await h4.digestMessages(digest)
    const officeMail = mails.find((m) => m.to === officeUser.email)
    expect(officeMail.body).toContain("Check accommodation availability (3)")
    expect(officeMail.body).toContain("/admin/intern-accommodation")
    expect(mails.find((m) => m.to === professor.email).body).toContain("Updated (3)")

    const decided = await office.post(`${base}/batch-decision`).send({
      stage: "office", action: "approve", confirmAvailability: true,
      requests: items.map((r) => ({ id: r._id, revision: r.h4.revision })),
    })
    expect(decided.body.data.results.every((r) => r.success)).toBe(true)
    digest = await AccommodationDigest.findOne({ note: /CW Office recommended 3/ }).sort({ createdAt: -1 }).lean()
    mails = await h4.digestMessages(digest)
    expect(mails.filter((m) => m.to === chiefUser.email)).toHaveLength(1)
    expect(mails.find((m) => m.to === chiefUser.email).body).toContain("Review H4 request (3)")

    items = (await api.get(`${base}/requests`).query({ batchId: items[0].h4.batchId })).body.data.items
    await chief.post(`${base}/batch-decision`).send({
      stage: "chief", action: "approve", requests: items.map((r) => ({ id: r._id, revision: r.h4.revision })),
    })
    items = (await api.get(`${base}/requests`).query({ batchId: items[0].h4.batchId })).body.data.items
    expect(items.every((r) => r.status === "CW Approved")).toBe(true)

    const hostel = await createHostel()
    const offered = await office.post(`${base}/batch-offer`).send({
      requests: [
        ...items.slice(0, 2).map((r) => ({ id: r._id, revision: r.h4.revision, hostelId: hostel._id, mess: "without", accommodationDailyRate: 100 })),
        { id: items[2]._id, revision: items[2].h4.revision + 5, hostelId: hostel._id, mess: "without", accommodationDailyRate: 100 },
      ],
    })
    expect(offered.status).toBe(200)
    expect(offered.body.data.results.map((r) => r.success)).toEqual([true, true, false])
    const charged = (await api.get(`${base}/requests/${items[0]._id}`)).body.data
    expect(charged.status).toBe("Payment Requested")
    expect(charged.quote.subtotal).toBe(500)
    digest = await AccommodationDigest.findOne({ note: /issued charges for 2/ }).lean()
    expect(digest.requestIds).toHaveLength(2)
    expect((await office.post(`${base}/batch-offer`).send({ requests: [] })).status).toBe(400)
    expect((await api.post(`${base}/batch-offer`).send({ requests: [{ id: items[2]._id, revision: 0 }] })).body.data.results[0].success).toBe(false)
  }, 120000)

  it("lets CW Office correct details at any open stage without resetting approvals", async () => {
    const professor = await seed.createUser({ role: "Academics", email: `h4-edit-${Date.now()}@iiti.ac.in` })
    const api = await as(professor)
    const office = await as(await seed.admin({ subRole: "Chief Warden Office" }))
    const chief = await as(await seed.admin({ subRole: "Chief Warden" }))
    let r = (await api.post(`${base}/batches`).send({ students: [student(9)], recommend: true })).body.data.items[0]
    const post = async (client, suffix, body) => {
      const res = await client.post(`${base}/requests/${r._id}/${suffix}`).send({ revision: r.h4.revision, ...body })
      expect(res.status, JSON.stringify(res.body)).toBe(200)
      r = res.body.data
    }
    await post(office, "decision/office", { action: "approve", confirmAvailability: true })
    expect(r.status).toBe("Pending CW Approval")
    await post(office, "edit", { student: { ...asStudent(r), name: "Corrected Name", stay: { fromDate: ymd(6), toDate: ymd(12), purpose: "Research" } } })
    expect(r.status).toBe("Pending CW Approval")
    expect(r.currentStage).toBe("chief")
    expect(r.applicantName).toBe("Corrected Name")
    expect(r.nights).toBe(6)
    expect(r.h4.payer.verifiedAt).toBeTruthy()
    expect(r.timeline.at(-1).note).toContain("name")

    await post(chief, "decision/chief", { action: "approve" })
    await post(office, "offer", { hostelId: (await createHostel())._id, mess: "without", accommodationDailyRate: 100 })
    const moved = { ...asStudent(r), stay: { fromDate: ymd(7), toDate: ymd(12), purpose: "Research" } }
    expect((await office.post(`${base}/requests/${r._id}/edit`).send({ revision: r.h4.revision, student: moved })).status).toBe(400)
    const amount = r.payment.amount
    await post(office, "edit", { student: { ...asStudent(r), stay: { fromDate: ymd(6), toDate: ymd(12), purpose: "Research" }, email: "fixed@example.com" } })
    expect(r.status).toBe("Payment Requested")
    expect(r.applicantEmail).toBe("fixed@example.com")
    expect(r.payment.amount).toBe(amount)
    expect((await office.post(`${base}/requests/${r._id}/edit`).send({ revision: r.h4.revision, student: { ...asStudent(r), stay: { fromDate: ymd(6), toDate: ymd(12), purpose: "Research" } } })).status).toBe(400)
  }, 120000)
})
