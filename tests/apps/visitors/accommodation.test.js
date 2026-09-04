import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel, createRoom } from "../../helpers/seed/operations.js"
import { seedHostelSupervisorProfile } from "../../helpers/seed/admin-sw.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---- fixtures & helpers ----------------------------------------------------

const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d
}

const dateOnly = (d) => d.toISOString().slice(0, 10)

// Submit requires >= 3 working days lead time; day(7)/day(9) is always safe.
const validBody = () => ({
  typeKey: "parents-siblings",
  guests: [
    { name: "Ramu Yadav", gender: "Male", age: 52, relation: "Father", aadharNumber: "111122223333" },
  ],
  roomPreference: "Single",
  stay: { fromDate: dateOnly(day(7)), toDate: dateOnly(day(9)) },
  facultyAdvisorEmail: "fa.advisor@iiti.ac.in",
  permanentAddress: "12 Civil Lines",
})

const iitiStudent = () =>
  seed.createUser({
    role: "Student",
    email: `acc-student-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@iiti.ac.in`,
  })

const cwo = () => seed.createUser({ role: "Admin", subRole: "Chief Warden Office" })
const chiefWarden = () => seed.createUser({ role: "Admin", subRole: "Chief Warden" })
const accountant = () => seed.createUser({ role: "Admin", subRole: "Accountant" })

async function supervisorFor(hostel) {
  const { user } = await seedHostelSupervisorProfile({ hostels: [hostel], activeHostel: hostel })
  return user
}

async function submitFor(student, overrides = {}) {
  const api = await as(student)
  const res = await api.post("/api/v1/accommodation/requests").send({ ...validBody(), ...overrides })
  expect(res.status).toBe(201)
  return res.body.data
}

/** submit -> capacity approve (routes to FA) -> bypass FA -> CW approve. */
async function advanceToCwApproved(student, overrides = {}) {
  const request = await submitFor(student, overrides)
  const cwoApi = await as(await cwo())
  let res = await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({
    action: "approve",
  })
  expect(res.status).toBe(200)
  const cwApi = await as(await chiefWarden())
  res = await cwApi.post(`/api/v1/accommodation/requests/${request._id}/bypass-fa`)
  expect(res.status).toBe(200)
  res = await cwApi.post(`/api/v1/accommodation/requests/${request._id}/decision`).send({ action: "approve" })
  expect(res.status).toBe(200)
  return request
}

async function createFaToken(requestId) {
  const { createActionLinkToken, ACTION_LINK_TOKEN_TYPE } = await import(
    "../../../src/services/action-links/action-link-token.service.js"
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

// ---------------------------------------------------------------------------

describe("accommodation — types & quote", () => {
  it("GET /types lists the seeded parents-siblings type for students and admins", async () => {
    const studentApi = await as(await iitiStudent())
    const res = await studentApi.get("/api/v1/accommodation/types")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const keys = res.body.data.map((t) => t.key ?? t)
    expect(keys).toContain("parents-siblings")
  })

  it("POST /quote returns person/night counts with zero amounts (office sets prices)", async () => {
    const api = await as(await iitiStudent())
    const res = await api.post("/api/v1/accommodation/quote").send({
      persons: 2,
      stay: { fromDate: dateOnly(day(7)), toDate: dateOnly(day(10)) },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.persons).toBe(2)
    expect(res.body.data.nights).toBe(3)
    expect(res.body.data.total).toBe(0)
    expect(res.body.data.subtotal).toBe(0)
  })
})

describe("accommodation — submission validation", () => {
  it("401 without a session; 403 for non-students", async () => {
    const anonApi = await anon()
    expect((await anonApi.post("/api/v1/accommodation/requests").send(validBody())).status).toBe(401)

    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.post("/api/v1/accommodation/requests").send(validBody())).status).toBe(403)
  })

  it("rejects a non-institute email domain for the parents-siblings type", async () => {
    const outsider = await seed.student({ email: `out-${Date.now()}@gmail.com` })
    const api = await as(outsider)
    const res = await api.post("/api/v1/accommodation/requests").send(validBody())
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/iiti\.ac\.in/)
  })

  it("validates guests, room preference, stay dates, and lead time", async () => {
    const student = await iitiStudent()
    const api = await as(student)

    const cases = [
      [{ ...validBody(), guests: [] }, /at least one guest/i],
      [{ ...validBody(), guests: [{ name: "X", gender: "Male", age: 40 }] }, /relation/i],
      [{ ...validBody(), guests: [{ name: "X", gender: "Male", age: 40, relation: "Uncle", aadharNumber: "123" }] }, /12 digits/i],
      [{ ...validBody(), guests: [{ name: "X", gender: "Male", age: 300, relation: "Uncle", aadharNumber: "111122223333" }] }, /between 0 and 150/i],
      [{ ...validBody(), roomPreference: "Dorm" }, /single or double/i],
      [{ ...validBody(), stay: {} }, /from\/to dates are required/i],
      [
        { ...validBody(), stay: { fromDate: dateOnly(day(9)), toDate: dateOnly(day(7)) } },
        /after the start date/i,
      ],
      [
        { ...validBody(), stay: { fromDate: dateOnly(day(1)), toDate: dateOnly(day(3)) } },
        /working days in advance/i,
      ],
    ]
    for (const [payload, pattern] of cases) {
      const res = await api.post("/api/v1/accommodation/requests").send(payload)
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(pattern)
    }
  })

  it("requires a faculty advisor email (body or profile)", async () => {
    const student = await iitiStudent()
    const api = await as(student)
    const body = validBody()
    delete body.facultyAdvisorEmail
    const res = await api.post("/api/v1/accommodation/requests").send(body)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/faculty advisor/i)
  })

  it("happy path creates the request at Pending CWO Capacity Check with a timeline entry", async () => {
    const student = await iitiStudent()
    const request = await submitFor(student)

    expect(request.status).toBe("Pending CWO Capacity Check")
    expect(request.currentStage).toBe("cwOfficeCapacity")
    expect(request.persons).toBe(1)
    expect(request.nights).toBe(2)
    expect(request.applicantEmail).toBe(student.email)
    expect(request.guests[0].aadharNumber).toBe("111122223333")
    expect(request.quote.total).toBe(0)
  })
})

describe("accommodation — Chief Warden Office capacity screening", () => {
  it("only Admin 'Chief Warden Office' subrole passes; plain admins are 403", async () => {
    const request = await submitFor(await iitiStudent())

    const plainAdminApi = await as(await seed.admin())
    expect(
      (await plainAdminApi.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({ action: "approve" }))
        .status
    ).toBe(403)

    const cwApi = await as(await chiefWarden()) // Chief Warden is not CWO
    expect(
      (await cwApi.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({ action: "approve" }))
        .status
    ).toBe(403)
  })

  it("request_modification and reject require a reason and land in the right statuses", async () => {
    const returned = await submitFor(await iitiStudent())
    const rejected = await submitFor(await iitiStudent())
    const api = await as(await cwo())

    let res = await api.post(`/api/v1/accommodation/requests/${returned._id}/capacity-decision`).send({
      action: "request_modification",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/reason is required/i)

    res = await api.post(`/api/v1/accommodation/requests/${returned._id}/capacity-decision`).send({
      action: "request_modification",
      reason: "Dates clash with a conference",
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Returned to Student")

    res = await api.post(`/api/v1/accommodation/requests/${rejected._id}/capacity-decision`).send({
      action: "reject",
      reason: "No capacity at all",
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rejected")

    // invalid decision value
    res = await api.post(`/api/v1/accommodation/requests/${returned._id}/capacity-decision`).send({
      action: "maybe",
    })
    expect(res.status).toBe(400)
  })

  it("approve routes to the faculty advisor stage when an FA email exists", async () => {
    const request = await submitFor(await iitiStudent())
    const api = await as(await cwo())
    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({
      action: "approve",
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Pending FA Recommendation")
    expect(res.body.data.currentStage).toBe("facultyAdvisor")
  })

  it("a request not awaiting capacity check refuses further capacity decisions", async () => {
    const request = await advanceToCwApproved(await iitiStudent())
    const api = await as(await cwo())
    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({
      action: "approve",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not awaiting a capacity check/i)
  })
})

describe("accommodation — faculty advisor public token flow", () => {
  it("invalid tokens 404 on both GET and POST", async () => {
    const api = await anon()
    expect((await api.get("/api/v1/accommodation/recommendation/not-a-real-token")).status).toBe(404)
    expect(
      (await api.post("/api/v1/accommodation/recommendation/not-a-real-token").send({ decision: "recommend" })).status
    ).toBe(404)
  })

  it("GET serves the recommendation view without auth; POST recommend advances to CW approval and consumes the token", async () => {
    const student = await iitiStudent()
    const request = await submitFor(student)
    const cwoApi = await as(await cwo())
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({ action: "approve" })

    const token = await createFaToken(request._id)
    const api = await anon()

    const view = await api.get(`/api/v1/accommodation/recommendation/${token}`)
    expect(view.status).toBe(200)
    expect(view.body.data.alreadyHandled).toBe(false)
    expect(view.body.data.request.applicantEmail).toBe(student.email)
    expect(view.body.data.request.guests[0].name).toBe("Ramu Yadav")

    // invalid decision value
    expect(
      (await api.post(`/api/v1/accommodation/recommendation/${token}`).send({ decision: "maybe" })).status
    ).toBe(400)

    const rec = await api.post(`/api/v1/accommodation/recommendation/${token}`).send({
      decision: "recommend",
      reason: "Genuine family visit",
    })
    expect(rec.status).toBe(200)
    expect(rec.body.data.status).toBe("Pending CW Approval")

    // token consumed -> replay 404s
    expect((await api.get(`/api/v1/accommodation/recommendation/${token}`)).status).toBe(404)
    expect(
      (await api.post(`/api/v1/accommodation/recommendation/${token}`).send({ decision: "recommend" })).status
    ).toBe(404)

    // workflow actually moved
    const studentApi = await as(student)
    const detail = await studentApi.get(`/api/v1/accommodation/requests/${request._id}`)
    expect(detail.body.data.status).toBe("Pending CW Approval")
  })

  it("decline returns the request to the student", async () => {
    const request = await submitFor(await iitiStudent())
    await as(await cwo())
      .then((api) => api.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({ action: "approve" }))

    const token = await createFaToken(request._id)
    const res = await anon().then((a) =>
      a.post(`/api/v1/accommodation/recommendation/${token}`).send({ decision: "decline", reason: "Not on campus" })
    )
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Returned to Student")
  })
})

describe("accommodation — Chief Warden decision & FA bypass", () => {
  it("bypass-fa only works from Pending FA Recommendation and only for CW/CWO", async () => {
    const request = await submitFor(await iitiStudent())
    const cwoApi = await as(await cwo())
    await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`)
      .send({ action: "approve" })

    // accountant cannot bypass
    const acctApi = await as(await accountant())
    expect((await acctApi.post(`/api/v1/accommodation/requests/${request._id}/bypass-fa`)).status).toBe(403)

    const res = await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/bypass-fa`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Pending CW Approval")

    // second bypass refused (wrong status now)
    expect((await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/bypass-fa`)).status).toBe(400)
  })

  it("CW approve / request-modification / reject each land correctly; modification requires reason", async () => {
    const approved = await advanceToCwApprovedPreDecision(await iitiStudent())
    const modify = await advanceToCwApprovedPreDecision(await iitiStudent())
    const reject = await advanceToCwApprovedPreDecision(await iitiStudent())
    const api = await as(await chiefWarden())

    let res = await api.post(`/api/v1/accommodation/requests/${approved._id}/decision`).send({ action: "approve" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("CW Approved")

    res = await api.post(`/api/v1/accommodation/requests/${modify._id}/decision`).send({ action: "request_modification" })
    expect(res.status).toBe(400)
    res = await api
      .post(`/api/v1/accommodation/requests/${modify._id}/decision`)
      .send({ action: "request_modification", reason: "Please fix the guest list" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Returned to Student")

    res = await api
      .post(`/api/v1/accommodation/requests/${reject._id}/decision`)
      .send({ action: "reject", reason: "Not eligible" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rejected")

    // decided requests refuse re-decision
    res = await api.post(`/api/v1/accommodation/requests/${approved._id}/decision`).send({ action: "approve" })
    expect(res.status).toBe(400)
  })

  /** submit -> capacity approve -> bypass (leaves request at Pending CW Approval). */
  async function advanceToCwApprovedPreDecision(student) {
    const request = await submitFor(student)
    const cwoApi = await as(await cwo())
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`).send({ action: "approve" })
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/bypass-fa`)
    return request
  }
})

describe("accommodation — listing & ownership", () => {
  it("students see only their own requests; staff see everything; ?mine=true works for staff", async () => {
    const mine = await iitiStudent()
    const other = await iitiStudent()
    await submitFor(mine)
    await submitFor(other)

    const studentApi = await as(mine)
    let res = await studentApi.get("/api/v1/accommodation/requests")
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBe(1)
    expect(String(res.body.data.items[0].requesterUserId)).toBe(String(mine._id))

    const adminApi = await as(await seed.admin())
    res = await adminApi.get("/api/v1/accommodation/requests")
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2)

    res = await adminApi.get("/api/v1/accommodation/requests?mine=true")
    expect(res.body.data.items.length).toBe(0)

    res = await adminApi.get("/api/v1/accommodation/requests?status=Pending%20CWO%20Capacity%20Check")
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2)
  })

  it("GET by id forbids foreign students but allows staff", async () => {
    const owner = await iitiStudent()
    const stranger = await iitiStudent()
    const request = await submitFor(owner)

    const strangerApi = await as(stranger)
    expect((await strangerApi.get(`/api/v1/accommodation/requests/${request._id}`)).status).toBe(403)

    const staffApi = await as(await seed.admin())
    const res = await staffApi.get(`/api/v1/accommodation/requests/${request._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data._id).toBe(String(request._id))

    const { Types } = await import("mongoose")
    expect((await staffApi.get(`/api/v1/accommodation/requests/${new Types.ObjectId().toString()}`)).status).toBe(404)
  })

  it("student cancel works while pre-approval and refuses afterwards; unknown ids 404", async () => {
    const student = await iitiStudent()
    const cancellable = await submitFor(student)
    const advanced = await advanceToCwApproved(student)
    const api = await as(student)

    let res = await api.post(`/api/v1/accommodation/requests/${advanced._id}/cancel`)
    expect(res.status).toBe(400) // CW Approved is not cancellable by the student
    expect(res.body.message).toMatch(/no longer be cancelled/i)

    res = await api.post(`/api/v1/accommodation/requests/${cancellable._id}/cancel`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Cancelled")

    const { Types } = await import("mongoose")
    expect((await api.post(`/api/v1/accommodation/requests/${new Types.ObjectId().toString()}/cancel`)).status).toBe(404)
  })

  it("resubmit only works from Returned to Student and reroutes to capacity check", async () => {
    const student = await iitiStudent()
    const request = await submitFor(student)
    const cwoApi = await as(await cwo())
    await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`)
      .send({ action: "request_modification", reason: "Fix dates" })

    const api = await as(student)
    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/resubmit`).send({
      stay: { fromDate: dateOnly(day(8)), toDate: dateOnly(day(11)) },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Pending CWO Capacity Check")
    expect(new Date(res.body.data.stay.toDate).getUTCDate()).toBe(day(11).getUTCDate())

    // resubmitting again (wrong status) fails
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/resubmit`).send({})
    expect(res.status).toBe(400)
  })
})

describe("accommodation — payment request & hostel allotment (CW Office)", () => {
  it("issuePaymentRequest validates status, hostel, and per-guest charges", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `A-${Date.now() % 100000}`, capacity: 2 })
    const api = await as(await cwo())

    // wrong status first
    const early = await submitFor(await iitiStudent())
    let res = await api.post(`/api/v1/accommodation/requests/${early._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: 500, gstPercentage: 0 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not approved and ready/i)

    // missing hostel
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      guestCharges: [{ guestIndex: 0, price: 500, gstPercentage: 0 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/select a hostel/i)

    // charges missing/mismatched
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({ hostelId: hostel._id })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/every guest/i)

    // missing price refused
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, gstPercentage: 0 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/price is required/i)

    // negative / non-numeric price refused
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: -10, gstPercentage: 0 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/price is invalid/i)

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: "abc", gstPercentage: 0 }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/price is invalid/i)

    // happy path
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      remarks: "Seminar accommodation rate",
      guestCharges: [{ guestIndex: 0, price: 500, gstPercentage: 12 }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Requested")
    expect(res.body.data.payment.amount).toBe(560) // 500 + 12%
    expect(String(res.body.data.allotment.hostelId)).toBe(String(hostel._id))
    expect(res.body.data.guestAllotments).toEqual([
      expect.objectContaining({ guestIndex: 0, hostelId: expect.anything() }),
    ])
    expect(String(res.body.data.guestAllotments[0].hostelId)).toBe(String(hostel._id))
  })

  it("Chief Warden Office may set 0 as the amount for any guest", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student, {
      guests: [
        { name: "Ramu Yadav", gender: "Male", age: 52, relation: "Father", aadharNumber: "111122223333" },
        { name: "Sita Yadav", gender: "Female", age: 48, relation: "Mother", aadharNumber: "444455556666" },
      ],
    })
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `Z-${Date.now() % 100000}`, capacity: 2 })
    const api = await as(await cwo())

    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [
        { guestIndex: 0, price: 500, gstPercentage: 0 },
        { guestIndex: 1, price: 0, gstPercentage: 0 },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Requested")
    expect(res.body.data.payment.amount).toBe(500)
    expect(res.body.data.quote.guestCharges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ guestIndex: 0, price: 500, total: 500 }),
        expect.objectContaining({ guestIndex: 1, price: 0, total: 0 }),
      ])
    )
  })

  it("all guests at 0 waives payment and allots the hostel as Payment Verified", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `W-${Date.now() % 100000}`, capacity: 2 })
    const api = await as(await cwo())

    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      remarks: "Complimentary stay",
      guestCharges: [{ guestIndex: 0, price: 0, gstPercentage: 0 }],
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/no charge/i)
    expect(res.body.data.status).toBe("Payment Verified")
    expect(res.body.data.payment.amount).toBe(0)
    expect(res.body.data.payment.status).toBe("Verified")
    expect(res.body.data.payment.note).toBe("No charge")
    expect(String(res.body.data.allotment.hostelId)).toBe(String(hostel._id))
    expect(res.body.data.quote.guestCharges[0].price).toBe(0)
  })

  it("allots a different hostel per visitor and only counts those guests against each hostel", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student, {
      guests: [
        { name: "Ramu Yadav", gender: "Male", age: 52, relation: "Father", aadharNumber: "111122223333" },
        { name: "Sita Yadav", gender: "Female", age: 48, relation: "Mother", aadharNumber: "444455556666" },
      ],
    })
    const hostelA = await createHostel()
    const hostelB = await createHostel()
    await createRoom({ hostelId: hostelA._id, roomNumber: `PA-${Date.now() % 100000}`, capacity: 2 })
    await createRoom({ hostelId: hostelB._id, roomNumber: `PB-${Date.now() % 100000}`, capacity: 2 })
    const api = await as(await cwo())

    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostelA._id, // ignored when guestAllotments is present
      guestCharges: [
        { guestIndex: 0, price: 400, gstPercentage: 0 },
        { guestIndex: 1, price: 400, gstPercentage: 0 },
      ],
      guestAllotments: [
        { guestIndex: 0, hostelId: hostelA._id },
        { guestIndex: 1, hostelId: hostelB._id },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Requested")
    expect(String(res.body.data.allotment.hostelId)).toBe(String(hostelA._id))
    expect(res.body.data.guestAllotments).toHaveLength(2)
    expect(String(res.body.data.guestAllotments[0].hostelId)).toBe(String(hostelA._id))
    expect(String(res.body.data.guestAllotments[1].hostelId)).toBe(String(hostelB._id))
  })

  it("deferPayment moves Payment Requested -> Payment Deferred and refuses otherwise", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const api = await as(student)

    // too early
    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/defer-payment`)
    expect(res.status).toBe(400)

    // bring to Payment Requested
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `B-${Date.now() % 100000}`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 300, gstPercentage: 0 }],
      })
    )

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/defer-payment`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Deferred")
    expect(res.body.data.payment.mode).toBe("later")

    // deferring twice refused
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/defer-payment`)
    expect(res.status).toBe(400)
  })
})

describe("accommodation — student payment proof & accountant verification", () => {
  async function paymentRequested(student) {
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `P-${Date.now() % 100000}`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 400, gstPercentage: 0 }],
      })
    )
    return request
  }

  const proof = () => ({
    utr: "123456789012",
    paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
    screenshotFileRef: "media://payments/receipt.png",
  })

  it("submitPayment validates UTR, date, and screenshot; foreign students are forbidden", async () => {
    const student = await iitiStudent()
    const request = await paymentRequested(student)
    const api = await as(student)

    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/screenshot is required/i)

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      screenshotFileRef: "x",
      utr: "12345",
      paidAt: new Date().toISOString(),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/12-digit/i)

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      screenshotFileRef: "x",
      utr: "123456789012",
      paidAt: new Date(Date.now() + 86400 * 1000).toISOString(),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/future/i)

    const strangerApi = await as(await iitiStudent())
    res = await strangerApi.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof())
    expect(res.status).toBe(403)
  })

  it("full pay-now cycle: submit -> verify -> rooms unlocked", async () => {
    const student = await iitiStudent()
    const request = await paymentRequested(student)
    const api = await as(student)

    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof())
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Submitted")
    expect(res.body.data.payment.utr).toBe("123456789012")

    // double submission refused
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof())
    expect(res.status).toBe(400)

    const acctApi = await as(await accountant())

    // reject requires a note and returns to Payment Requested (mode now)
    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "reject" })
    expect(res.status).toBe(400)
    res = await acctApi
      .post(`/api/v1/accommodation/requests/${request._id}/payment-verify`)
      .send({ action: "reject", note: "UTR not found in bank statement" })
    expect(res.status).toBe(200)
    expect(res.body.data.payment.status).toBe("Rejected")
    expect(res.body.data.status).toBe("Payment Requested") // mode was "now"

    // resubmit then verify
    await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof())
    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Verified")
    expect(res.body.data.payment.verifiedAt).toBeTruthy()

    // nothing left to verify
    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    expect(res.status).toBe(400)
  })

  it("accountant can correct UTR/paidAt before verifying", async () => {
    const student = await iitiStudent()
    const request = await paymentRequested(student)
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof()))

    const acctApi = await as(await accountant())
    let res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-details`).send({ utr: "12" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/12-digit/i)

    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-details`).send({
      utr: "999988887777",
      paidAt: new Date(Date.now() - 7200 * 1000).toISOString(),
    })
    expect(res.status).toBe(200)

    const detail = await as(student).then((a) => a.get(`/api/v1/accommodation/requests/${request._id}`))
    expect(detail.body.data.payment.utr).toBe("999988887777")
  })

  it("manual settlement: mark_paid settles from Payment Requested; mark_unpaid needs a note and a verified payment", async () => {
    const student = await iitiStudent()
    const request = await paymentRequested(student)
    const acctApi = await as(await accountant())

    let res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-settle`).send({ action: "bogus" })
    expect(res.status).toBe(400)

    res = await acctApi
      .post(`/api/v1/accommodation/requests/${request._id}/payment-settle`)
      .send({ action: "mark_paid", method: "" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/record how the payment/i)

    res = await acctApi
      .post(`/api/v1/accommodation/requests/${request._id}/payment-settle`)
      .send({ action: "mark_paid", method: "Cash at counter", reference: "123456789012" })
    expect(res.status).toBe(200)
    expect(res.body.data.payment.status).toBe("Verified")
    expect(res.body.data.status).toBe("Payment Verified")

    // mark_unpaid requires a note; works from Verified back to Pending (mode now)
    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-settle`).send({ action: "mark_unpaid" })
    expect(res.status).toBe(400)
    res = await acctApi
      .post(`/api/v1/accommodation/requests/${request._id}/payment-settle`)
      .send({ action: "mark_unpaid", note: "Cash never reached the account" })
    expect(res.status).toBe(200)
    expect(res.body.data.payment.status).toBe("Pending")
  })
})

describe("accommodation — schedule changes (postpone / extend)", () => {
  async function verifiedRequest(student) {
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `S-${Date.now() % 100000}`, capacity: 2 })
    const cwoApi = await as(await cwo())
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: 400, gstPercentage: 0 }],
    })
    return request
  }

  it("student can request one postpone and two extensions; limits enforced", async () => {
    const student = await iitiStudent()
    const request = await verifiedRequest(student)
    const api = await as(student)

    // postpone: needs fromDate + toDate + reason
    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "postpone",
      toDate: dateOnly(day(14)),
      reason: "Trains unavailable",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/start date is required/i)

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "postpone",
      fromDate: dateOnly(day(10)),
      toDate: dateOnly(day(14)),
      reason: "Trains unavailable",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/submitted to chief warden office/i)

    // second postpone refused (limit 1)
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "postpone",
      fromDate: dateOnly(day(10)),
      toDate: dateOnly(day(15)),
      reason: "again",
    })
    expect(res.status).toBe(400)
    // the pending-change guard is checked before the per-type limit
    expect(res.body.message).toMatch(/already pending/i)

    // extension end must be after current end
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "extend",
      toDate: dateOnly(day(3)),
      reason: "early",
    })
    expect(res.status).toBe(400)

    // the still-pending postponement blocks any further change request
    res = await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "extend",
      toDate: dateOnly(day(16)),
      reason: "Flight cancelled",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already pending/i)
  })

  it("CWO decides: reject needs a note; approve applies dates and can add extra charge", async () => {
    const student = await iitiStudent()
    const request = await verifiedRequest(student)
    const api = await as(student)
    const cwoApi = await as(await cwo())

    await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "extend",
      toDate: dateOnly(day(16)),
      reason: "Flight cancelled",
    })

    const changeId = (await as(student).then((a) => a.get(`/api/v1/accommodation/requests/${request._id}`)))
      .body.data.scheduleChanges.at(-1)._id

    let res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/schedule-change/${changeId}/decision`)
      .send({ action: "reject" })
    expect(res.status).toBe(400)

    res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/schedule-change/${changeId}/decision`)
      .send({ action: "reject", note: "Hostel closed those days" })
    expect(res.status).toBe(200)
    expect(res.body.data.scheduleChanges.at(-1).status).toBe("rejected")

    // second extension, approved with extra amount folded into the open bill
    await api.post(`/api/v1/accommodation/requests/${request._id}/schedule-change`).send({
      type: "extend",
      toDate: dateOnly(day(17)),
      reason: "Still stuck",
    })
    const change2 = (
      await as(student).then((a) => a.get(`/api/v1/accommodation/requests/${request._id}`))
    ).body.data.scheduleChanges.at(-1)._id

    res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/schedule-change/${change2}/decision`)
      .send({ action: "approve", extraAmount: 250, note: "Two extra nights" })
    expect(res.status).toBe(200)
    expect(res.body.data.stay.toDate).toBeTruthy()
    expect(res.body.data.payment.amount).toBe(650) // 400 + 250

    // deciding twice refused
    res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/schedule-change/${change2}/decision`)
      .send({ action: "approve" })
    expect(res.status).toBe(400)
  })
})

describe("accommodation — arrival tail (availability, rooms, check-in/out)", () => {
  async function fullyVerified(student) {
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    const roomA = await createRoom({ hostelId: hostel._id, roomNumber: `T-${Date.now() % 100000}a`, capacity: 2 })
    await createRoom({ hostelId: hostel._id, roomNumber: `T-${Date.now() % 100000}b`, capacity: 2 })
    const cwoApi = await as(await cwo())
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: 400, gstPercentage: 0 }],
    })
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/payment`).send(proof()))
    await as(await accountant()).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    )
    return { request, hostel, roomA }
  }

  function proof() {
    return {
      utr: "123456789012",
      paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      screenshotFileRef: "media://payments/receipt.png",
    }
  }

  it("allotment availability is CWO-only and reports hostels + pricing presets", async () => {
    const student = await iitiStudent()
    const request = await submitFor(student)

    const supervisorApi = await as(await seed.createUser({ role: "Hostel Supervisor" }))
    expect((await supervisorApi.get(`/api/v1/accommodation/requests/${request._id}/allotment-availability`)).status).toBe(403)

    const cwoApi = await as(await cwo())
    const res = await cwoApi.get(`/api/v1/accommodation/requests/${request._id}/allotment-availability`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data.hostels)).toBe(true)
    expect(res.body.data.pricing).toHaveProperty("priceOptions")
    expect(res.body.data.pricing).toHaveProperty("gstOptions")
    if (res.body.data.hostels.length > 0) {
      expect(res.body.data.hostels[0]).toHaveProperty("rooms")
    }
  })

  it("room availability requires an allotted hostel; assignment validates coverage and beds", async () => {
    const student = await iitiStudent()
    const early = await submitFor(student) // no allotment yet
    const unscopedApi = await as(await seed.createUser({ role: "Hostel Supervisor" }))

    let res = await unscopedApi.get(`/api/v1/accommodation/requests/${early._id}/room-availability`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not been allotted/i)

    const { request, hostel, roomA } = await fullyVerified(await iitiStudent())

    res = await unscopedApi.get(`/api/v1/accommodation/requests/${request._id}/room-availability`)
    expect(res.status).toBe(403)

    const supervisorApi = await as(await supervisorFor(hostel))
    res = await supervisorApi.get(`/api/v1/accommodation/requests/${request._id}/room-availability`)
    expect(res.status).toBe(200)
    expect(res.body.data.rooms.length).toBeGreaterThanOrEqual(1)
    expect(res.body.data.guestIndexes).toEqual([0])

    // empty assignment refused
    res = await supervisorApi.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({ rooms: [] })
    expect(res.status).toBe(400)

    // guest index out of range
    res = await supervisorApi.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: roomA._id, guestIndexes: [5] }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid guest index/i)

    // happy path
    res = await supervisorApi.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: roomA._id, guestIndexes: [0] }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rooms Assigned")
    expect(String(res.body.data.rooms[0].roomId)).toBe(String(roomA._id))
  })

  it("each supervisor only assigns visitors allotted to their hostel; rooms complete when both have assigned", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student, {
      guests: [
        { name: "Ramu Yadav", gender: "Male", age: 52, relation: "Father", aadharNumber: "111122223333" },
        { name: "Sita Yadav", gender: "Female", age: 48, relation: "Mother", aadharNumber: "444455556666" },
      ],
    })
    const hostelA = await createHostel()
    const hostelB = await createHostel()
    const hostelC = await createHostel()
    const roomA = await createRoom({ hostelId: hostelA._id, roomNumber: `SA-${Date.now() % 100000}`, capacity: 2 })
    const roomB = await createRoom({ hostelId: hostelB._id, roomNumber: `SB-${Date.now() % 100000}`, capacity: 2 })
    await createRoom({ hostelId: hostelC._id, roomNumber: `SC-${Date.now() % 100000}`, capacity: 2 })

    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        guestCharges: [
          { guestIndex: 0, price: 300, gstPercentage: 0 },
          { guestIndex: 1, price: 300, gstPercentage: 0 },
        ],
        guestAllotments: [
          { guestIndex: 0, hostelId: hostelA._id },
          { guestIndex: 1, hostelId: hostelB._id },
        ],
      })
    )
    await as(student).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
        utr: "123456789012",
        paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
        screenshotFileRef: "media://payments/split.png",
      })
    )
    await as(await accountant()).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    )

    const supA = await as(await supervisorFor(hostelA))
    const supB = await as(await supervisorFor(hostelB))
    const supC = await as(await supervisorFor(hostelC))

    const listA = await supA.get("/api/v1/accommodation/requests?limit=200")
    expect(listA.body.data.items.some((r) => String(r._id) === String(request._id))).toBe(true)
    const listC = await supC.get("/api/v1/accommodation/requests?limit=200")
    expect(listC.body.data.items.some((r) => String(r._id) === String(request._id))).toBe(false)

    // A cannot assign B's visitor
    let res = await supA.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: roomB._id, guestIndexes: [1] }],
    })
    expect(res.status).toBe(403)

    res = await supA.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: roomA._id, guestIndexes: [0] }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Payment Verified")
    expect(res.body.data.rooms).toHaveLength(1)

    res = await supB.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: roomB._id, guestIndexes: [1] }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rooms Assigned")
    expect(res.body.data.rooms).toHaveLength(2)
  })

  it("gate check-in requires assigned rooms; check-out requires check-in", async () => {
    const student = await iitiStudent()
    const { request, hostel, roomA } = await fullyVerified(student)
    const gate = await seed.createUser({ role: "Hostel Gate" })
    const gateApi = await as(gate)

    // cannot check in before rooms
    let res = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkin`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/rooms are assigned/i)

    await as(await supervisorFor(hostel)).then((s) =>
      s.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
        rooms: [{ roomId: roomA._id, guestIndexes: [0] }],
      })
    )

    res = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkin`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Checked In")
    expect(res.body.data.checkInAt).toBeTruthy()

    // checkout before checkin is impossible now; checkout works
    res = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkout`)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Checked Out")

    // and once out, no more check-ins
    res = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkin`)
    expect(res.status).toBe(400)
  })

  it("admin-cancel frees a booking any time before terminal states and needs a reason", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const cwoApi = await as(await cwo())

    let res = await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/admin-cancel`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/reason is required/i)

    res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/admin-cancel`)
      .send({ reason: "Guests dropped out" })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Cancelled")

    // terminal already
    res = await cwoApi
      .post(`/api/v1/accommodation/requests/${request._id}/admin-cancel`)
      .send({ reason: "again" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already cancelled/i)
  })
})

describe("accommodation — invoice (legacy deferred settlement path)", () => {
  async function seedLegacyDeferred(student, hostel) {
    const { AccommodationRequest } = await import("../../../src/models/index.js")
    return AccommodationRequest.create({
      typeKey: "parents-siblings",
      requesterUserId: student._id,
      applicantName: student.name,
      applicantEmail: student.email,
      applicantPhone: "9999999999",
      facultyAdvisorEmail: "fa.advisor@iiti.ac.in",
      guests: [
        { name: "Legacy Guest", gender: "Female", age: 44, relation: "Mother", aadharNumber: "999988887777" },
      ],
      roomPreference: "Single",
      stay: { fromDate: day(-2), toDate: day(1) },
      persons: 1,
      nights: 3,
      status: "Rooms Assigned", // legacy in-flight status
      payment: { amount: 900, mode: "later", status: "Deferred" },
      allotment: { hostelId: hostel._id, allottedBy: null, allottedAt: new Date() },
    })
  }

  it("deferred bill settled after rooms: submit -> verify issues an invoice the student can download", async () => {
    const student = await iitiStudent()
    const hostel = await createHostel()
    const request = await seedLegacyDeferred(student, hostel)
    const api = await as(student)

    // legacy deferred settlement: status stays Hostel Allotted, payment -> Submitted
    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "121212121212",
      paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      screenshotFileRef: "media://payments/legacy.png",
    })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("Rooms Assigned")
    expect(res.body.data.payment.status).toBe("Submitted")

    // invoice endpoint refuses before generation
    res = await api.get(`/api/v1/accommodation/requests/${request._id}/invoice`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no invoice has been generated/i)

    // accountant verifies -> invoice issued (storage upload failure tolerated)
    const acctApi = await as(await accountant())
    res = await acctApi.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    expect(res.status).toBe(200)
    expect(res.body.data.payment.status).toBe("Verified")

    const detail = await api.get(`/api/v1/accommodation/requests/${request._id}`)
    expect(detail.body.data.invoice.generatedAt).toBeTruthy()
    expect(detail.body.data.invoice.number).toMatch(/\//)

    // download the PDF (re-rendered locally since storage is unreachable)
    res = await api.get(`/api/v1/accommodation/requests/${request._id}/invoice?disposition=attachment`)
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/application\/pdf/)
    expect(res.headers["content-disposition"]).toMatch(/^attachment;/)
    expect(Number(res.headers["content-length"])).toBeGreaterThan(500)
  })
})

// ---- hardening edges (added) ----------------------------------------------

describe("accommodation — workflow transition violations", () => {
  /** submit -> capacity approve (request sits at Pending FA Recommendation). */
  async function pendingFa(student) {
    const request = await submitFor(student)
    await (await as(await cwo()))
      .post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`)
      .send({ action: "approve" })
    return request
  }

  it("chief-warden decision is refused while the request still awaits the faculty advisor (before bypass)", async () => {
    const request = await pendingFa(await iitiStudent())
    const res = await (await as(await chiefWarden()))
      .post(`/api/v1/accommodation/requests/${request._id}/decision`)
      .send({ action: "approve" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not awaiting chief warden approval/i)
  })

  it("defer-payment after the initial payment is verified but with no additional bill open", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `DV-${Date.now() % 100000}`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 400, gstPercentage: 0 }],
      })
    )
    const api = await as(student)
    await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "123456789012",
      paidAt: new Date().toISOString(),
      screenshotFileRef: "media://payments/dv.png",
    })
    await as(await accountant()).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    )

    // Payment Verified + settled initial bill + nothing additional open
    const res = await api.post(`/api/v1/accommodation/requests/${request._id}/defer-payment`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no additional payment is open to defer/i)
  })

  it("schedule changes are refused on terminal statuses (cancelled, rejected)", async () => {
    const student = await iitiStudent()

    const cancelled = await submitFor(student)
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${cancelled._id}/cancel`))
    let res = await as(student).then((a) =>
      a.post(`/api/v1/accommodation/requests/${cancelled._id}/schedule-change`).send({
        type: "extend",
        toDate: dateOnly(day(20)),
        reason: "too late anyway",
      })
    )
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/only be changed after the request is approved/i)

    const rejectOwner = await iitiStudent()
    const rejected = await submitFor(rejectOwner)
    await (await as(await cwo()))
      .post(`/api/v1/accommodation/requests/${rejected._id}/capacity-decision`)
      .send({ action: "reject", reason: "No capacity" })
    res = await as(rejectOwner).then((a) =>
      a.post(`/api/v1/accommodation/requests/${rejected._id}/schedule-change`).send({
        type: "extend",
        toDate: dateOnly(day(20)),
        reason: "nope",
      })
    )
    expect(res.status).toBe(400)

    // resubmitting a rejected (non-returned) request is also refused
    const resub = await as(rejectOwner).then((a) => a.post(`/api/v1/accommodation/requests/${rejected._id}/resubmit`).send({}))
    expect(resub.status).toBe(400)
    expect(resub.body.message).toMatch(/only returned requests/i)
  })

  it("student cancel is refused once payment has been requested", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `CP-${Date.now() % 100000}`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 400, gstPercentage: 0 }],
      })
    )

    const res = await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/cancel`))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no longer be cancelled/i)
  })

  it("assign-rooms is refused while payment is deferred", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: `DF-${Date.now() % 100000}`, capacity: 2 })
    const cwoApi = await as(await cwo())
    await cwoApi.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [{ guestIndex: 0, price: 300, gstPercentage: 0 }],
    })
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/defer-payment`))

    const supervisorApi = await as(await supervisorFor(hostel))
    const res = await supervisorApi.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [{ roomId: room._id, guestIndexes: [0] }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/only after payment is verified/i)
  })

  it("checkout twice is refused; admin-cancel on an invoiced booking reports it already invoiced", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    const room = await createRoom({ hostelId: hostel._id, roomNumber: `DC-${Date.now() % 100000}`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 300, gstPercentage: 0 }],
      })
    )
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "123456789012",
      paidAt: new Date().toISOString(),
      screenshotFileRef: "media://payments/dc.png",
    }))
    await as(await accountant()).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    )
    const gateApi = await as(await seed.createUser({ role: "Hostel Gate" }))
    await as(await supervisorFor(hostel)).then((s) =>
      s.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
        rooms: [{ roomId: room._id, guestIndexes: [0] }],
      })
    )
    await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkin`)
    const firstOut = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkout`)
    expect(firstOut.status).toBe(200)

    const again = await gateApi.post(`/api/v1/accommodation/requests/${request._id}/checkout`)
    expect(again.status).toBe(400)
    expect(again.body.message).toMatch(/must be checked in before checking out/i)

    // terminal INVOICED status refuses admin-cancel with a specific message
    const { AccommodationRequest } = await import("../../../src/models/index.js")
    const invoiced = await AccommodationRequest.create({
      typeKey: "parents-siblings",
      requesterUserId: student._id,
      applicantName: student.name,
      applicantEmail: student.email,
      applicantPhone: "9999999999",
      facultyAdvisorEmail: "fa.advisor@iiti.ac.in",
      guests: [
        { name: "Invoiced Guest", gender: "Male", age: 60, relation: "Grandfather", aadharNumber: "121212121212" },
      ],
      roomPreference: "Single",
      stay: { fromDate: day(-5), toDate: day(-2) },
      persons: 1,
      nights: 3,
      status: "Invoiced",
      payment: { amount: 900, mode: "now", status: "Verified" },
    })
    const cancelRes = await (await as(await cwo()))
      .post(`/api/v1/accommodation/requests/${invoiced._id}/admin-cancel`)
      .send({ reason: "mistake" })
    expect(cancelRes.status).toBe(400)
    expect(cancelRes.body.message).toMatch(/already invoiced/i)
  })
})

describe("accommodation — payment-request & proof boundaries", () => {
  async function cwApprovedWithHostel(student) {
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    await createRoom({ hostelId: hostel._id, roomNumber: `PB-${Date.now() % 100000}`, capacity: 2 })
    return { request, hostel }
  }

  it("guestCharges array length must match guests exactly (short and long both refused)", async () => {
    const { request, hostel } = await cwApprovedWithHostel(await iitiStudent())
    const api = await as(await cwo())

    let res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/every guest/i)

    res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
      hostelId: hostel._id,
      guestCharges: [
        { guestIndex: 0, price: 500, gstPercentage: 0 },
        { guestIndex: 1, price: 500, gstPercentage: 0 }, // one guest too many
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/every guest/i)
  })

  it("UTR must be exactly 12 digits: 11 and 13 digit values are refused; paidAt exactly now passes", async () => {
    const student = await iitiStudent()
    const { request, hostel } = await cwApprovedWithHostel(student)
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 100, gstPercentage: 0 }],
      })
    )

    const api = await as(student)
    for (const utr of ["12345678901", "1234567890123"]) {
      const res = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
        utr,
        paidAt: new Date().toISOString(),
        screenshotFileRef: "media://payments/u.png",
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/12-digit/i)
    }

    // paidAt exactly now passes the not-in-future check
    const ok = await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "123456789012",
      paidAt: new Date().toISOString(),
      screenshotFileRef: "media://payments/u.png",
    })
    expect(ok.status).toBe(200)
  })
})

describe("accommodation — expired FA recommendation token branch", () => {
  async function expiredFaToken(requestId) {
    const { createActionLinkToken, ACTION_LINK_TOKEN_TYPE } = await import(
      "../../../src/services/action-links/action-link-token.service.js"
    )
    const { rawToken } = await createActionLinkToken({
      type: ACTION_LINK_TOKEN_TYPE.ACCOMMODATION_FA_RECOMMENDATION,
      subjectModel: "AccommodationRequest",
      subjectId: requestId,
      recipientEmail: "fa.advisor@iiti.ac.in",
      payload: {},
      expiresAt: new Date(Date.now() - 60 * 1000), // already expired
    })
    return rawToken
  }

  it("an expired token answers 400 'expired' on GET and POST (distinct from invalid-token 404)", async () => {
    const student = await iitiStudent()
    const request = await submitFor(student)
    await (await as(await cwo()))
      .post(`/api/v1/accommodation/requests/${request._id}/capacity-decision`)
      .send({ action: "approve" })

    const token = await expiredFaToken(request._id)
    const api = await anon()

    const view = await api.get(`/api/v1/accommodation/recommendation/${token}`)
    expect(view.status).toBe(400)
    expect(view.body.message).toMatch(/expired/i)

    const rec = await api.post(`/api/v1/accommodation/recommendation/${token}`).send({ decision: "recommend" })
    expect(rec.status).toBe(400)
    expect(rec.body.message).toMatch(/expired/i)

    // the underlying request never moved
    const detail = await as(student).then((a) => a.get(`/api/v1/accommodation/requests/${request._id}`))
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe("Pending FA Recommendation")
  })
})

describe("accommodation — invoice disposition variants & list pagination clamp", () => {
  async function seedInvoicedLegacy(student, hostel) {
    const { AccommodationRequest } = await import("../../../src/models/index.js")
    return AccommodationRequest.create({
      typeKey: "parents-siblings",
      requesterUserId: student._id,
      applicantName: student.name,
      applicantEmail: student.email,
      applicantPhone: "9999999999",
      facultyAdvisorEmail: "fa.advisor@iiti.ac.in",
      guests: [
        { name: "Disp Guest", gender: "Female", age: 39, relation: "Aunt", aadharNumber: "343434343434" },
      ],
      roomPreference: "Single",
      stay: { fromDate: day(-3), toDate: day(-1) },
      persons: 1,
      nights: 2,
      status: "Rooms Assigned",
      payment: { amount: 700, mode: "later", status: "Deferred" },
      allotment: { hostelId: hostel._id, allottedBy: null, allottedAt: new Date() },
    })
  }

  it("disposition falls back to inline unless exactly 'attachment' is requested", async () => {
    const student = await iitiStudent()
    const hostel = await createHostel()
    const request = await seedInvoicedLegacy(student, hostel)
    const api = await as(student)

    await api.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "565656565656",
      paidAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      screenshotFileRef: "media://payments/disp.png",
    })
    const verified = await (await as(await accountant()))
      .post(`/api/v1/accommodation/requests/${request._id}/payment-verify`)
      .send({ action: "verify" })
    expect(verified.status).toBe(200)

    for (const qs of ["", "?disposition=inline", "?disposition=bogus"]) {
      const res = await api.get(`/api/v1/accommodation/requests/${request._id}/invoice${qs}`)
      expect(res.status).toBe(200)
      expect(res.headers["content-disposition"]).toMatch(/^inline;/)
      expect(res.headers["content-type"]).toMatch(/application\/pdf/)
    }
  })

  it("list pagination clamps limit=1000 to 100 and page=-1 back to 1", async () => {
    const adminApi = await as(await seed.admin())
    const res = await adminApi.get("/api/v1/accommodation/requests?page=-1&limit=1000")
    expect(res.status).toBe(200)
    expect(res.body.data.pagination.page).toBe(1)
    expect(res.body.data.pagination.limit).toBe(100)
  })
})

describe("accommodation — assignment duplicate-guest guard", () => {
  it("the same guest index in two rooms is refused even when another bed is free", async () => {
    const student = await iitiStudent()
    const request = await advanceToCwApproved(student)
    const hostel = await createHostel()
    const roomA = await createRoom({ hostelId: hostel._id, roomNumber: `DG-${Date.now() % 100000}a`, capacity: 2 })
    await createRoom({ hostelId: hostel._id, roomNumber: `DG-${Date.now() % 100000}b`, capacity: 2 })
    await as(await cwo()).then((c) =>
      c.post(`/api/v1/accommodation/requests/${request._id}/payment-request`).send({
        hostelId: hostel._id,
        guestCharges: [{ guestIndex: 0, price: 300, gstPercentage: 0 }],
      })
    )
    await as(student).then((a) => a.post(`/api/v1/accommodation/requests/${request._id}/payment`).send({
      utr: "123456789012",
      paidAt: new Date().toISOString(),
      screenshotFileRef: "media://payments/dg.png",
    }))
    await as(await accountant()).then((a) =>
      a.post(`/api/v1/accommodation/requests/${request._id}/payment-verify`).send({ action: "verify" })
    )

    const supervisorApi = await as(await supervisorFor(hostel))
    const res = await supervisorApi.post(`/api/v1/accommodation/requests/${request._id}/assign-rooms`).send({
      rooms: [
        { roomId: roomA._id, guestIndexes: [0] },
        { roomId: roomA._id, guestIndexes: [0] },
      ],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/more than one room/i)
  })
})
