import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---- fixture helpers -------------------------------------------------------

const futureDate = (daysAhead) => {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}

const validPayload = (targetAdminUserId) => ({
  targetAdminUserId,
  visitorName: "Ramesh Visitor",
  mobileNumber: "9876543210",
  email: "ramesh.visitor@example.com",
  idType: "Aadhaar",
  idNumber: "123456789012",
  reason: "Family visit",
  preferredDate: futureDate(5),
  preferredTime: "10:30 AM",
})

/** Admin with an appointment-enabled SA subrole. */
const appointmentAdmin = (subRole = "Officer SA") =>
  seed.createUser({ role: "Admin", subRole, acceptingAppointments: true })

// ---------------------------------------------------------------------------

describe("appointments — public endpoints", () => {
  it("POST /appointments is public and returns 201 with the standard envelope", async () => {
    const admin = await appointmentAdmin()
    const api = await anon()

    const res = await api.post("/api/v1/appointments").send(validPayload(admin._id))
    expect(res.status).toBe(201)
    // NOTE: this controller spreads data+message instead of the standard envelope
    expect(res.body.message).toMatch(/submitted successfully/i)
    const appt = res.body.appointment
    expect(appt).toBeDefined()
    expect(appt.status).toBe("Pending")
    expect(appt.visitorName).toBe("Ramesh Visitor")
    expect(appt.targetSubRole).toBe("Officer SA")
    expect(appt.targetOfficial.id).toBe(String(admin._id))
  })

  it("rejects each missing required field with 400 naming the field", async () => {
    const admin = await appointmentAdmin()
    const api = await anon()
    const base = validPayload(admin._id)

    for (const field of [
      "targetAdminUserId",
      "visitorName",
      "mobileNumber",
      "email",
      "idType",
      "idNumber",
      "reason",
      "preferredDate",
      "preferredTime",
    ]) {
      const payload = { ...base }
      delete payload[field]
      const res = await api.post("/api/v1/appointments").send(payload)
      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toContain(field)
    }
  })

  it("rejects an invalid target id, a non-appointment admin target, and a non-accepting target", async () => {
    const api = await anon()

    // malformed ObjectId
    let res = await api.post("/api/v1/appointments").send(validPayload("not-an-id"))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid appointment target/i)

    // valid id but wrong role
    const student = await seed.student()
    res = await api.post("/api/v1/appointments").send(validPayload(student._id))
    expect(res.status).toBe(400)

    // right subrole but not accepting appointments
    const closed = await seed.createUser({ role: "Admin", subRole: "Dean SA", acceptingAppointments: false })
    res = await api.post("/api/v1/appointments").send(validPayload(closed._id))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/not accepting appointments/i)
  })

  it("validates idType, mobile number, email format, and minimum lead time", async () => {
    const admin = await appointmentAdmin()
    const api = await anon()
    const base = validPayload(admin._id)

    let res = await api.post("/api/v1/appointments").send({ ...base, idType: "Passport" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/aadhaar or pan/i)

    res = await api.post("/api/v1/appointments").send({ ...base, mobileNumber: "12345" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/mobile/i)

    res = await api.post("/api/v1/appointments").send({ ...base, email: "not-an-email" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/email/i)

    res = await api.post("/api/v1/appointments").send({ ...base, preferredDate: futureDate(1) })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/day-after-tomorrow|working days|advance/i)
  })

  it("GET /appointments/public/targets lists only accepting appointment admins", async () => {
    await appointmentAdmin("Associate Dean SA")
    await seed.createUser({ role: "Admin", subRole: "Dean SA", acceptingAppointments: false })
    await seed.createUser({ role: "Admin", subRole: "HCU", acceptingAppointments: true }) // not an appointment subrole

    const api = await anon()
    const res = await api.get("/api/v1/appointments/public/targets")
    expect(res.status).toBe(200)
    const targets = res.body.targets
    expect(Array.isArray(targets)).toBe(true)
    for (const t of targets) {
      expect(t.subRole).toMatch(/Officer SA|Associate Dean SA|Dean SA/)
      expect(t.label).toContain("(")
    }
  })
})

describe("appointments — auth wall", () => {
  it("all protected routes 401 without a session", async () => {
    const api = await anon()
    const routes = [
      ["get", "/api/v1/appointments/admin"],
      ["get", "/api/v1/appointments/admin/me/availability"],
      ["patch", "/api/v1/appointments/admin/me/availability"],
      ["get", "/api/v1/appointments/admin/000000000000000000000000"],
      ["patch", "/api/v1/appointments/admin/000000000000000000000000/review"],
      ["get", "/api/v1/appointments/gate"],
      ["patch", "/api/v1/appointments/gate/000000000000000000000000/entry"],
    ]
    for (const [method, url] of routes) {
      const res = await api[method](url)
      expect(res.status).toBe(401)
    }
  })

  it("wrong roles get 403 on admin and gate route groups", async () => {
    const student = await seed.student()
    const warden = await seed.warden()
    const gate = await seed.createUser({ role: "Hostel Gate" })

    const studentApi = await as(student)
    expect((await studentApi.get("/api/v1/appointments/admin")).status).toBe(403)
    expect((await studentApi.get("/api/v1/appointments/gate")).status).toBe(403)

    const wardenApi = await as(warden)
    expect((await wardenApi.get("/api/v1/appointments/admin")).status).toBe(403)

    const gateApi = await as(gate)
    expect((await gateApi.get("/api/v1/appointments/admin")).status).toBe(403)
    expect((await studentApi.get("/api/v1/appointments/gate")).status).toBe(403)
    void gate
  })

  it("an Admin WITHOUT an appointment subrole passes the route guard but is forbidden in the service", async () => {
    const hcuAdmin = await seed.createUser({ role: "Admin", subRole: "HCU" })
    const api = await as(hcuAdmin)
    const res = await api.get("/api/v1/appointments/admin")
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/appointment-enabled admin roles/i)
  })
})

describe("appointments — availability settings", () => {
  it("GET/PATCH /admin/me/availability round-trips for an appointment admin", async () => {
    const admin = await appointmentAdmin()
    const api = await as(admin)

    let res = await api.get("/api/v1/appointments/admin/me/availability")
    expect(res.status).toBe(200)
    expect(res.body.availability.acceptingAppointments).toBe(true)
    expect(res.body.availability.subRole).toBe("Officer SA")

    res = await api.patch("/api/v1/appointments/admin/me/availability").send({ acceptingAppointments: false })
    expect(res.status).toBe(200)
    expect(res.body.availability.acceptingAppointments).toBe(false)
    expect(res.body.message).toMatch(/disabled/i)

    // public submit now refuses this target
    const anonApi = await anon()
    const submit = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    expect(submit.status).toBe(400)

    // toggle back on
    res = await api.patch("/api/v1/appointments/admin/me/availability").send({ acceptingAppointments: true })
    expect(res.status).toBe(200)
    expect(res.body.availability.acceptingAppointments).toBe(true)
  })

  it("PATCH availability validates the boolean", async () => {
    const admin = await appointmentAdmin()
    const api = await as(admin)
    const res = await api.patch("/api/v1/appointments/admin/me/availability").send({ acceptingAppointments: "yes" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/boolean/i)
  })
})

describe("appointments — admin review workflow", () => {
  async function pendingAppointment() {
    const admin = await appointmentAdmin()
    const anonApi = await anon()
    const res = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    expect(res.status).toBe(201)
    return { admin, id: res.body.appointment.id }
  }

  it("admin list is scoped to own appointments with pagination metadata", async () => {
    const { admin, id } = await pendingAppointment()
    const otherAdmin = await appointmentAdmin("Dean SA")

    const api = await as(admin)
    const res = await api.get("/api/v1/appointments/admin")
    expect(res.status).toBe(200)
    expect(res.body.items.length).toBeGreaterThanOrEqual(1)
    expect(res.body.items.map((a) => a.id)).toContain(id)
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 10 })
    expect(Number(res.body.pagination.total)).toBeGreaterThanOrEqual(1)

    const otherApi = await as(otherAdmin)
    const otherRes = await otherApi.get("/api/v1/appointments/admin")
    expect(otherRes.body.items.map((a) => a.id)).not.toContain(id)
  })

  it("list supports status filter and search", async () => {
    const { admin, id } = await pendingAppointment()
    const api = await as(admin)

    let res = await api.get("/api/v1/appointments/admin?status=Pending")
    expect(res.status).toBe(200)
    expect(res.body.items.map((a) => a.id)).toContain(id)

    res = await api.get("/api/v1/appointments/admin?status=Approved")
    expect(res.body.items.map((a) => a.id)).not.toContain(id)

    res = await api.get("/api/v1/appointments/admin?search=Ramesh")
    expect(res.body.items.map((a) => a.id)).toContain(id)

    res = await api.get("/api/v1/appointments/admin?search=no-such-visitor-xyz")
    expect(res.body.items.length).toBe(0)
  })

  it("GET /admin/:id serves the owner and forbids another appointment admin", async () => {
    const { admin, id } = await pendingAppointment()
    const otherAdmin = await appointmentAdmin()

    const api = await as(admin)
    const res = await api.get(`/api/v1/appointments/admin/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.appointment.id).toBe(id)
    expect(res.body.appointment.review.action).toBeNull()

    const otherApi = await as(otherAdmin)
    const otherRes = await otherApi.get(`/api/v1/appointments/admin/${id}`)
    expect(otherRes.status).toBe(403)
    expect(otherRes.body.message).toMatch(/assigned to you/i)
  })

  it("GET /admin/:id rejects a malformed id with 400 and an unknown id with 404", async () => {
    const admin = await appointmentAdmin()
    const api = await as(admin)

    expect((await api.get("/api/v1/appointments/admin/not-an-id")).status).toBe(400)

    const { Types } = await import("mongoose")
    const missing = new Types.ObjectId().toString()
    const res = await api.get(`/api/v1/appointments/admin/${missing}`)
    expect(res.status).toBe(404)
  })

  it("approve requires date+time, records the meeting, and marks emailSent false when SMTP is off", async () => {
    const { admin, id } = await pendingAppointment()
    const api = await as(admin)

    // missing fields
    let res = await api.patch(`/api/v1/appointments/admin/${id}/review`).send({ action: "approve" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/date and time are required/i)

    // past date
    res = await api
      .patch(`/api/v1/appointments/admin/${id}/review`)
      .send({ action: "approve", approvedDate: "2020-01-01", approvedTime: "10:00 AM" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/past/i)

    // happy path
    res = await api
      .patch(`/api/v1/appointments/admin/${id}/review`)
      .send({ action: "approve", approvedDate: futureDate(6), approvedTime: "11:00 AM", description: "Come to office" })
    expect(res.status).toBe(200)
    expect(res.body.emailSent).toBe(false) // SMTP disabled in tests
    expect(res.body.appointment.status).toBe("Approved")
    expect(res.body.appointment.approvedMeeting.time).toBe("11:00 AM")
    expect(res.body.appointment.review.action).toBe("approve")

    // double review refused
    const again = await api.patch(`/api/v1/appointments/admin/${id}/review`).send({
      action: "reject",
      description: "changed my mind",
    })
    expect(again.status).toBe(400)
    expect(again.body.message).toMatch(/already reviewed/i)
  })

  it("reject requires a description and stores it", async () => {
    const { admin, id } = await pendingAppointment()
    const api = await as(admin)

    let res = await api.patch(`/api/v1/appointments/admin/${id}/review`).send({ action: "reject" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/description is required/i)

    res = await api
      .patch(`/api/v1/appointments/admin/${id}/review`)
      .send({ action: "reject", description: "Out of office that week" })
    expect(res.status).toBe(200)
    expect(res.body.appointment.status).toBe("Rejected")
    expect(res.body.appointment.review.description).toBe("Out of office that week")
    expect(res.body.appointment.approvedMeeting.date).toBeNull()
  })

  it("review validates the action value and unknown ids", async () => {
    const { admin, id } = await pendingAppointment()
    const api = await as(admin)
    const { Types } = await import("mongoose")

    let res = await api.patch(`/api/v1/appointments/admin/${id}/review`).send({ action: "postpone" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/approve or reject/i)

    res = await api.patch(`/api/v1/appointments/admin/${new Types.ObjectId().toString()}/review`).send({
      action: "approve",
      approvedDate: futureDate(6),
      approvedTime: "10:00",
    })
    expect(res.status).toBe(404)
  })
})

describe("appointments — hostel gate entry", () => {
  it("gate list shows only approved appointments; today filter by default", async () => {
    const admin = await appointmentAdmin()
    const anonApi = await anon()

    // meeting today -> appears in default gate view
    const todayAppt = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    const todayId = todayAppt.body.appointment.id
    const adminApi = await as(admin)
    await adminApi
      .patch(`/api/v1/appointments/admin/${todayId}/review`)
      .send({ action: "approve", approvedDate: futureDate(0), approvedTime: "09:00 AM" })

    // meeting next week -> only in ?dateFilter=all
    const laterAppt = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    const laterId = laterAppt.body.appointment.id
    await adminApi
      .patch(`/api/v1/appointments/admin/${laterId}/review`)
      .send({ action: "approve", approvedDate: futureDate(7), approvedTime: "09:00 AM" })

    const gate = await seed.createUser({ role: "Hostel Gate" })
    const gateApi = await as(gate)

    let res = await gateApi.get("/api/v1/appointments/gate")
    expect(res.status).toBe(200)
    expect(res.body.items.map((a) => a.id)).toContain(todayId)
    expect(res.body.items.map((a) => a.id)).not.toContain(laterId)

    res = await gateApi.get("/api/v1/appointments/gate?dateFilter=all&entryStatus=pending")
    expect(res.body.items.map((a) => a.id)).toContain(laterId)

    res = await gateApi.get("/api/v1/appointments/gate?dateFilter=all&entryStatus=entered")
    expect(res.body.items.map((a) => a.id)).not.toContain(todayId)
  })

  it("marking entry works once for approved appointments and is refused otherwise", async () => {
    const admin = await appointmentAdmin()
    const anonApi = await anon()
    const created = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    const approvedId = created.body.appointment.id
    await as(admin)
      .then((api) =>
        api.patch(`/api/v1/appointments/admin/${approvedId}/review`).send({
          action: "approve",
          approvedDate: futureDate(0),
          approvedTime: "10:00 AM",
        })
      )
      .then((r) => expect(r.status).toBe(200))

    // still-pending appointment cannot be marked
    const pendingCreated = await anonApi.post("/api/v1/appointments").send(validPayload(admin._id))
    const pendingId = pendingCreated.body.appointment.id

    const gate = await seed.createUser({ role: "Hostel Gate" })
    const gateApi = await as(gate)

    let res = await gateApi.patch(`/api/v1/appointments/gate/${pendingId}/entry`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/only approved appointments/i)

    res = await gateApi.patch(`/api/v1/appointments/gate/${approvedId}/entry`).send({ note: "Family of two" })
    expect(res.status).toBe(200)
    expect(res.body.appointment.gateEntry.entered).toBe(true)
    expect(res.body.appointment.gateEntry.note).toBe("Family of two")
    expect(res.body.appointment.gateEntry.markedBy.id).toBe(String(gate._id))

    // second mark refused
    res = await gateApi.patch(`/api/v1/appointments/gate/${approvedId}/entry`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already marked/i)

    // unknown + malformed ids
    const { Types } = await import("mongoose")
    expect((await gateApi.patch(`/api/v1/appointments/gate/${new Types.ObjectId().toString()}/entry`)).status).toBe(404)
    expect((await gateApi.patch("/api/v1/appointments/gate/bad-id/entry")).status).toBe(400)
  })
})
