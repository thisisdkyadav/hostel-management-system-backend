/**
 * Integration tests for the Warden family module.
 * Base path: /api/v1/warden
 *
 * Covers the three role-scoped route families:
 *   - /profile + /active-hostel                (Warden)
 *   - /associate-warden/*                      (Associate Warden)
 *   - /hostel-supervisor/*                     (Hostel Supervisor)
 *
 * NOTE on envelopes: controllers send `result.data` directly, so success
 * bodies are NOT wrapped in { success, data }: GET /profile returns the
 * populated StaffRoles document (with a `hostelId` mirror of activeHostelId);
 * PUT /active-hostel returns { message, activeHostel }.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import crypto from "node:crypto"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  seedHostel,
  seedWardenProfile,
  seedAssociateWardenProfile,
  seedHostelSupervisorProfile,
} from "../../helpers/seed/admin-sw.js"

const BASE = "/api/v1/warden"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

const randomObjectId = () => crypto.randomBytes(12).toString("hex")

describe("Role gating & authentication", () => {
  it("401 for unauthenticated requests across all route families", async () => {
    const api = await anon()
    for (const path of [
      `${BASE}/profile`,
      `${BASE}/active-hostel`,
      `${BASE}/associate-warden/profile`,
      `${BASE}/associate-warden/active-hostel`,
      `${BASE}/hostel-supervisor/profile`,
      `${BASE}/hostel-supervisor/active-hostel`,
    ]) {
      const res = await api.put(path).send({})
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    }
  })

  it("403 for wrong roles on each route family", async () => {
    const student = await seed.student()
    const studentApi = await as(student)

    const res1 = await studentApi.get(`${BASE}/profile`)
    expect(res1.status).toBe(403)
    expect(res1.body.success).toBe(false)
    expect(res1.body.message).toMatch(/Access denied/i)

    const res2 = await studentApi.get(`${BASE}/associate-warden/profile`)
    expect(res2.status).toBe(403)

    const res3 = await studentApi.get(`${BASE}/hostel-supervisor/profile`)
    expect(res3.status).toBe(403)
  })

  it("403 cross-family: a Warden cannot use associate-warden/hostel-supervisor routes", async () => {
    const warden = await seed.warden()
    const api = await as(warden)

    const aw = await api.get(`${BASE}/associate-warden/profile`)
    expect(aw.status).toBe(403)

    const hs = await api.get(`${BASE}/hostel-supervisor/profile`)
    expect(hs.status).toBe(403)

    const put = await api.put(`${BASE}/hostel-supervisor/active-hostel`).send({ hostelId: randomObjectId() })
    expect(put.status).toBe(403)
  })
})

describe("Warden profile & active hostel", () => {
  it("404 when the authenticated warden has no staff profile", async () => {
    const warden = await seed.warden() // User with role Warden but no StaffRoles doc
    const api = await as(warden)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/Warden profile not found/i)
  })

  it("returns the populated profile with hostels and active hostel mirror", async () => {
    const hostelA = await seedHostel({ name: `Warden-A-${randomObjectId()}` })
    const hostelB = await seedHostel({ name: `Warden-B-${randomObjectId()}` })
    const { user } = await seedWardenProfile({
      hostels: [hostelA, hostelB],
      activeHostel: hostelA,
    })

    const api = await as(user)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(200)
    // data is sent unwrapped — the populated StaffRoles document itself
    expect(String(res.body.userId._id)).toBe(String(user._id))
    expect(res.body.userId.email).toBe(user.email)
    const hostelNames = res.body.hostelIds.map((h) => h.name).sort()
    expect(hostelNames).toEqual([hostelA.name, hostelB.name].sort())
    // controller mirrors activeHostelId as `hostelId`
    expect(String(res.body.hostelId._id)).toBe(String(hostelA._id))
    expect(res.body.hostelId.name).toBe(hostelA.name)
    expect(res.body.status).toBe("assigned")
  })

  it("400 when hostelId is missing", async () => {
    const hostelA = await seedHostel()
    const { user } = await seedWardenProfile({ hostels: [hostelA], activeHostel: hostelA })
    const api = await as(user)

    const res = await api.put(`${BASE}/active-hostel`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/hostelId is required/i)
  })

  it("403 when switching to a hostel the warden is not assigned to", async () => {
    const assigned = await seedHostel()
    const other = await seedHostel()
    const { user } = await seedWardenProfile({ hostels: [assigned], activeHostel: assigned })
    const api = await as(user)

    const res = await api.put(`${BASE}/active-hostel`).send({ hostelId: String(other._id) })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not assigned/i)
  })

  it("switches active hostel and persists via follow-up GET", async () => {
    const hostelA = await seedHostel()
    const hostelB = await seedHostel()
    const { user } = await seedWardenProfile({ hostels: [hostelA, hostelB], activeHostel: hostelA })
    const api = await as(user)

    const res = await api.put(`${BASE}/active-hostel`).send({ hostelId: String(hostelB._id) })
    expect(res.status).toBe(200)
    // message is stripped by the controller — body is { activeHostel }
    expect(String(res.body.activeHostel._id)).toBe(String(hostelB._id))
    expect(res.body.activeHostel.name).toBe(hostelB.name)
    expect(res.body.activeHostel.type).toBe(hostelB.type)

    const after = await api.get(`${BASE}/profile`)
    expect(String(after.body.hostelId._id)).toBe(String(hostelB._id))
  })

  it("switching back to an already-assigned hostel works and keeps status assigned", async () => {
    const hostelA = await seedHostel()
    const hostelB = await seedHostel()
    const { user } = await seedWardenProfile({ hostels: [hostelA, hostelB], activeHostel: hostelB })
    const api = await as(user)

    const res = await api.put(`${BASE}/active-hostel`).send({ hostelId: String(hostelA._id) })
    expect(res.status).toBe(200)

    const after = await api.get(`${BASE}/profile`)
    expect(String(after.body.hostelId._id)).toBe(String(hostelA._id))
    expect(after.body.status).toBe("assigned")
  })
})

describe("Associate Warden profile & active hostel", () => {
  let hostelA, hostelB, user

  beforeAll(async () => {
    hostelA = await seedHostel()
    hostelB = await seedHostel()
    ;({ user } = await seedAssociateWardenProfile({
      hostels: [hostelA, hostelB],
      activeHostel: hostelA,
    }))
  })

  it("GET /associate-warden/profile returns the populated profile", async () => {
    const api = await as(user)
    const res = await api.get(`${BASE}/associate-warden/profile`)
    expect(res.status).toBe(200)
    expect(String(res.body.userId._id)).toBe(String(user._id))
    expect(res.body.hostelIds).toHaveLength(2)
    expect(String(res.body.hostelId._id)).toBe(String(hostelA._id))
    expect(res.body.category).toBe("Associate Warden")
  })

  it("400 when hostelId missing / 403 for unassigned hostel", async () => {
    const api = await as(user)

    const missing = await api.put(`${BASE}/associate-warden/active-hostel`).send({})
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/hostelId is required/i)

    const unassigned = await seedHostel()
    const forbidden = await api
      .put(`${BASE}/associate-warden/active-hostel`)
      .send({ hostelId: String(unassigned._id) })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.message).toMatch(/Associate Warden is not assigned/i)
  })

  it("PUT /associate-warden/active-hostel switches and persists via follow-up GET", async () => {
    const api = await as(user)
    const res = await api
      .put(`${BASE}/associate-warden/active-hostel`)
      .send({ hostelId: String(hostelB._id) })
    expect(res.status).toBe(200)
    // message is stripped by the controller — body is { activeHostel }
    expect(String(res.body.activeHostel._id)).toBe(String(hostelB._id))

    const after = await api.get(`${BASE}/associate-warden/profile`)
    expect(String(after.body.hostelId._id)).toBe(String(hostelB._id))
  })
})

describe("Hostel Supervisor profile & active hostel", () => {
  let hostelA, hostelB, user

  beforeAll(async () => {
    hostelA = await seedHostel()
    hostelB = await seedHostel()
    ;({ user } = await seedHostelSupervisorProfile({
      hostels: [hostelA, hostelB],
      activeHostel: hostelA,
    }))
  })

  it("GET /hostel-supervisor/profile returns the populated profile", async () => {
    const api = await as(user)
    const res = await api.get(`${BASE}/hostel-supervisor/profile`)
    expect(res.status).toBe(200)
    expect(String(res.body.userId._id)).toBe(String(user._id))
    expect(res.body.hostelIds).toHaveLength(2)
    expect(String(res.body.hostelId._id)).toBe(String(hostelA._id))
    expect(res.body.category).toBe("Hostel Supervisor")
  })

  it("400 when hostelId missing / 403 for unassigned hostel", async () => {
    const api = await as(user)

    const missing = await api.put(`${BASE}/hostel-supervisor/active-hostel`).send({})
    expect(missing.status).toBe(400)

    const unassigned = await seedHostel()
    const forbidden = await api
      .put(`${BASE}/hostel-supervisor/active-hostel`)
      .send({ hostelId: String(unassigned._id) })
    expect(forbidden.status).toBe(403)
    expect(forbidden.body.message).toMatch(/Hostel Supervisor is not assigned/i)
  })

  it("PUT /hostel-supervisor/active-hostel switches and persists via follow-up GET", async () => {
    const api = await as(user)
    const res = await api
      .put(`${BASE}/hostel-supervisor/active-hostel`)
      .send({ hostelId: String(hostelB._id) })
    expect(res.status).toBe(200)
    expect(String(res.body.activeHostel._id)).toBe(String(hostelB._id))

    const after = await api.get(`${BASE}/hostel-supervisor/profile`)
    expect(String(after.body.hostelId._id)).toBe(String(hostelB._id))
  })

  it("treats a well-formed but unknown ObjectId as an unassigned hostel (403)", async () => {
    // Sanity guard on ObjectId handling: a random (well-formed but unknown)
    // id is treated as "unassigned" -> 403, not a crash or a 404.
    const api = await as(user)
    const res = await api
      .put(`${BASE}/hostel-supervisor/active-hostel`)
      .send({ hostelId: randomObjectId() })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not assigned/i)
  })
})
