import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/intern-accommodation"
const ymd = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const academic = (extra = {}) => seed.createUser({ role: "Academics", email: `h4l-${Date.now()}-${Math.random()}@iiti.ac.in`, ...extra })
const student = () => ({
  name: "Letter student", gender: "Female", category: "intern", email: "letters@example.com",
  mobile: "9876543210", institute: "Other Institute", instituteAddress: "Bhopal", course: "BTech", department: "Chemistry",
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Research", checkInTime: "11:00", checkOutTime: "11:00" },
})
const mod = () => import("../../../src/apps/visitors/modules/intern-accommodation/h4.letters.js")
const notifications = async () => (await import("../../../src/apps/visitors/modules/intern-accommodation/h4.notifications.js")).h4Notifications

describe("H4 student letters", () => {
  it("validates the letter settings and falls back to the default wording", async () => {
    const office = await as(await seed.admin({ subRole: "Chief Warden Office" }))
    const path = "/api/v1/config/internAccommodation"
    expect((await office.put(path).send({ value: { roomFacilities: "One Bed" } })).status).toBe(400)
    expect((await office.put(path).send({ value: { contactEmail: "not-an-email" } })).status).toBe(400)
    expect((await office.put(path).send({ value: { gstPercentage: 0 } })).status).toBe(200)
    const { getH4Config } = await import("../../../src/apps/visitors/modules/intern-accommodation/h4.config.js")
    expect(await getH4Config()).toMatchObject({ occupancy: "double occupancy", roomFacilities: ["One Bed", "One Table", "One Chair", "One Mattress", "One Almirah"], contactEmail: "" })
    const value = { occupancy: "single occupancy", roomFacilities: [" One Bed ", "", "One Fan"], contactEmail: "cwo@iiti.ac.in", contactPhone: "0731 000 0000" }
    expect((await office.put(path).send({ value })).status).toBe(200)
    expect(await getH4Config()).toMatchObject({ occupancy: "single occupancy", roomFacilities: ["One Bed", "One Fan"], contactEmail: "cwo@iiti.ac.in" })
  })

  it("emails the student once when the request starts, with the faculty copied, and again on resend", async () => {
    const officeUser = await academic({ academicCategory: "office", name: "Physics Office" })
    const professor = await academic({ name: "Dr. Faculty Advisor" })
    const created = await (await as(officeUser)).post(`${base}/batches`).send({ facultyUserId: professor._id, students: [student()] })
    expect(created.status).toBe(201)
    const id = created.body.data.items[0]._id
    const { accommodationQueries } = await import("../../../src/services/accommodation/accommodationQueries.service.js")
    const load = () => accommodationQueries.findH4ById(id, { lean: true })
    let r = await load()
    const h4 = await notifications()
    const messages = await h4.messages(r)
    const letter = messages.find((m) => m.to === r.applicantEmail)
    expect(letter).toMatchObject({ cc: professor.email, replyTo: "cwo@iiti.ac.in", useTemplate: false })
    expect(letter.subject).toBe("Accommodation request received – IIT Indore hostel accommodation")
    expect(letter.body).toContain("Dear Letter student,")
    expect(letter.body).toContain("accommodation has been requested for you by Physics Office under the supervision of <strong>Dr. Faculty Advisor</strong>")
    expect(letter.body).toContain("You do not need to do anything right now.")
    expect(letter.body).toContain("Other Institute")
    expect(letter.body).toContain("cwo@iiti.ac.in")
    expect(letter.body).toContain("IIT Indore")
    expect(letter.body).not.toContain("/access/")
    // The professor still has to recommend, so they keep their own action email.
    expect(messages.find((m) => m.to === professor.email).body).toContain("Review and recommend")
    expect(messages.find((m) => m.to === officeUser.email).body).toContain("The student has been emailed: Accommodation request received")

    const { emailService } = await import("../../../src/services/email/index.js")
    const send = vi.spyOn(emailService, "sendCustomEmail").mockResolvedValue({ success: true })
    try {
      await h4.deliver(r)
      const sent = send.mock.calls.map(([m]) => m)
      expect(sent.find((m) => m.to === r.applicantEmail)).toMatchObject({ cc: professor.email })
      expect(sent.some((m) => "studentKey" in m)).toBe(false)
      r = await load()
      expect(r.h4.studentLetter.key).toBe("received:" + professor.email.toLowerCase() + "|letters@example.com")
      // Staff moving the request along does not write to the student again.
      expect((await h4.messages(r)).some((m) => m.to === r.applicantEmail)).toBe(false)

      const resent = await (await as(officeUser)).post(`${base}/requests/${id}/resend`).send({})
      expect(resent.status).toBe(200)
      r = await load()
      expect(r.h4.studentLetter.key).toBe("")
      expect((await h4.messages(r)).some((m) => m.to === r.applicantEmail)).toBe(true)

      send.mockResolvedValue({ success: false, error: "SMTP down" })
      expect(await h4.deliver(r)).toContain("Email delivery failed")
      expect((await load()).h4.studentLetter.key).toBe("")
    } finally {
      send.mockRestore()
    }
  })

  it("picks one letter per student-facing step", async () => {
    const { studentLetterKind } = await mod()
    const r = {
      _id: "64b000000000000000000001", applicantEmail: "S@example.com", status: "Payment Requested", allotment: { hostelId: "h" },
      h4: { mess: "without", facultyEmail: "f@iiti.ac.in" }, payment: { status: "Pending", amount: 500 }, additionalPayments: [], rooms: [],
    }
    const kind = (patch = {}) => studentLetterKind({ ...r, ...patch, h4: { ...r.h4, ...patch.h4 } })
    expect(kind({ status: "Draft" })).toBeNull()
    expect(kind({ status: "Pending CW Approval", allotment: {} }).kind).toBe("received")
    expect(kind()).toEqual({ kind: "charges", key: "charges:500|s@example.com" })
    expect(kind({ payment: { status: "Deferred", amount: 500 } })).toBeNull()
    expect(kind({ payment: { status: "Submitted", amount: 500, utr: "123456789012" } }).key).toBe("submitted:123456789012|s@example.com")
    expect(kind({ payment: { status: "Rejected", amount: 500, verifiedAt: new Date(5) } }).key).toBe("charges-rejected:5|s@example.com")
    const verified = { status: "Verified", amount: 500 }
    expect(kind({ payment: verified }).kind).toBe("verified")
    expect(kind({ payment: verified, h4: { mess: "with", caterer: { catererId: "c" }, messPhoto: { status: "Pending" } } }).kind).toBe("photo")
    expect(kind({ payment: verified, h4: { mess: "with", caterer: { catererId: "c" }, messPhoto: { status: "Submitted" } } })).toBeNull()
    expect(kind({ payment: verified, h4: { mess: "with", caterer: { catererId: "c" }, messPhoto: { status: "Approved" } } }).kind).toBe("photo-approved")
    expect(kind({ payment: verified, additionalPayments: [{ _id: "x", status: "Pending", amount: 50 }] }).kind).toBe("extra")
    expect(kind({ payment: verified, status: "Rooms Assigned", rooms: [{ roomId: "b" }, { roomId: "a" }] }).key).toBe("room:a,b|s@example.com")
    expect(kind({ payment: verified, status: "Checked In", rooms: [{ roomId: "a" }] })).toBeNull()
    expect(kind({ status: "Invoiced", invoice: { generatedAt: new Date(), number: "INV/1" } }).key).toBe("completed:INV/1|s@example.com")
    expect(kind({ h4: { amendment: { stage: "chief", changeId: "z" } } }).kind).toBe("date-change")
    expect(kind({ status: "Cancelled" }).kind).toBe("cancelled")
    expect(kind({ status: "Rejected", allotment: {} }).kind).toBe("rejected")
  })
})
