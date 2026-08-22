/**
 * Admin module — staff management routes (admin.routes.js lines ~190-260).
 *
 * Base path /api/v1/admin, Admin-only (authorizeRoles + route.admin.* keys).
 *
 * Envelope shapes actually observed (these controllers do NOT all use the
 * standard { success, message?, data } envelope):
 *   - GET lists return the bare array (result.data sent directly)
 *   - create/update/delete for wardens/associate-wardens/supervisors/gymkhana/
 *     academics/security/maintenance return `{ message }` only
 *   - POST /gymkhana and POST /maintenance add `success: true` alongside message
 *   - POST /security returns `{ message, security: <doc> }`
 *   - GET /maintenance-staff-stats/:staffId returns `{ success, data }`
 *   - hostel-gate returns `{ message }` / `{ hostelGates: [...] }`
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createHostel } from "../../helpers/seed/operations.js"

const BASE = "/api/v1/admin"

// Not-found probes use well-formed ObjectIds so a 404 means "not found", not a CastError.
const objectId = () => new mongoose.Types.ObjectId().toHexString()

// Users keep their email casing as given; match case-insensitively.
const byEmail = (list, email) => list.find((e) => String(e.email).toLowerCase() === email.toLowerCase())

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`
const emailFor = (kind) => `${kind}-${unique()}@hms.test`

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("admin staff management — auth wall (shared)", () => {
  it("401 without a session on every route group", async () => {
    const api = await anon()
    const paths = [
      "/wardens",
      "/associate-wardens",
      "/hostel-supervisors",
      "/gymkhana",
      "/academics",
      "/security",
      "/maintenance",
      "/maintenance-staff-stats/" + objectId(),
      "/hostel-gate/all",
    ]
    for (const p of paths) {
      const res = await api.get(BASE + p)
      expect(res.status).toBe(401)
    }
    expect((await api.post(`${BASE}/hostel-gate`).send({})).status).toBe(401)
    expect((await api.post(`${BASE}/warden`).send({})).status).toBe(401)
  })

  it("non-admin roles are 403 on the list endpoints", async () => {
    for (const user of [await seed.student(), await seed.warden(), await seed.security()]) {
      const api = await as(user)
      expect((await api.get(`${BASE}/wardens`)).status).toBe(403)
      expect((await api.get(`${BASE}/gymkhana`)).status).toBe(403)
      expect((await api.get(`${BASE}/maintenance`)).status).toBe(403)
      expect((await api.post(`${BASE}/security`).send({})).status).toBe(403)
    }
  })
})

/**
 * Warden / Associate Warden / Hostel Supervisor share one controller+service
 * template (list → bare array; CUD → { message }). Drive all three through the
 * same lifecycle suite.
 */
function staffRoleSuite({ label, listPath, createPath, idPath, createdMessage, updatedMessage, deletedMessage }) {
  describe(`${label} — CRUD lifecycle`, () => {
    let adminApi

    beforeAll(async () => {
      adminApi = await as(await seed.admin())
    })

    it("rejects creation with missing required fields (400)", async () => {
      const res = await adminApi.post(BASE + createPath).send({ email: emailFor(label) })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/Email, password, and name are required/i)
    })

    it("rejects non-array hostelIds (400)", async () => {
      const res = await adminApi.post(BASE + createPath).send({
        name: `X ${unique()}`,
        email: emailFor(label),
        password: "secret123",
        hostelIds: "not-an-array",
      })
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/hostelIds must be an array/i)
    })

    it("creates an assigned staff member and lists them", async () => {
      const hostel = await createHostel()
      const payload = {
        name: `${label} One`,
        email: emailFor(label),
        password: "secret123",
        phone: "9000000001",
        hostelIds: [String(hostel._id)],
      }
      const res = await adminApi.post(BASE + createPath).send(payload)
      expect(res.status).toBe(201)
      // observed envelope: { message } only — no success/data
      expect(res.body).toEqual({ message: createdMessage })

      const list = await adminApi.get(BASE + listPath)
      expect(list.status).toBe(200)
      // observed envelope: bare array
      expect(Array.isArray(list.body)).toBe(true)
      const entry = byEmail(list.body, payload.email)
      expect(entry).toBeDefined()
      expect(entry.name).toBe(payload.name)
      expect(entry.phone).toBe("9000000001")
      expect(entry.status).toBe("assigned")
      expect(entry.hostelIds.map(String)).toContain(String(hostel._id))
      expect(String(entry.activeHostelId)).toBe(String(hostel._id))
      expect(entry.category).toBeDefined()
    })

    it("creates an unassigned staff member when hostelIds is empty", async () => {
      const payload = { name: `${label} Two`, email: emailFor(label), password: "secret123" }
      const res = await adminApi.post(BASE + createPath).send(payload)
      expect(res.status).toBe(201)

      const list = await adminApi.get(BASE + listPath)
      const entry = byEmail(list.body, payload.email)
      expect(entry.status).toBe("unassigned")
      expect(entry.hostelIds).toEqual([])
      expect(entry.activeHostelId).toBeNull()
    })

    it("rejects duplicate emails (400)", async () => {
      const email = emailFor(label)
      expect((await adminApi.post(BASE + createPath).send({ name: "A", email, password: "secret123" })).status).toBe(201)
      const dup = await adminApi.post(BASE + createPath).send({ name: "B", email, password: "secret123" })
      expect(dup.status).toBe(400)
      expect(dup.body.message).toMatch(/already exists/i)
    })

    it("updates phone/category and reflects the change in the list", async () => {
      const email = emailFor(label)
      await adminApi.post(BASE + createPath).send({ name: `${label} Up`, email, password: "secret123" })
      const entry = byEmail((await adminApi.get(BASE + listPath)).body, email)

      const res = await adminApi.put(BASE + idPath(entry.id)).send({ phone: "9111111111", category: "Chief" })
      expect(res.status).toBe(200)
      expect(res.body.message).toBe(updatedMessage)

      const after = (await adminApi.get(BASE + listPath)).body.find((e) => e.id === entry.id)
      expect(after.phone).toBe("9111111111")
      expect(after.category).toBe("Chief")
    })

    it("reassigning hostels flips status assigned <-> unassigned and moves activeHostelId", async () => {
      const hostelA = await createHostel()
      const hostelB = await createHostel()
      const email = emailFor(label)
      await adminApi.post(BASE + createPath).send({
        name: `${label} Move`,
        email,
        password: "secret123",
        hostelIds: [String(hostelA._id)],
      })
      const entry = byEmail((await adminApi.get(BASE + listPath)).body, email)

      const toB = await adminApi.put(BASE + idPath(entry.id)).send({ hostelIds: [String(hostelB._id)] })
      expect(toB.status).toBe(200)
      let after = (await adminApi.get(BASE + listPath)).body.find((e) => e.id === entry.id)
      expect(after.hostelIds.map(String)).toEqual([String(hostelB._id)])
      expect(after.status).toBe("assigned")
      expect(String(after.activeHostelId)).toBe(String(hostelB._id))

      const toNone = await adminApi.put(BASE + idPath(entry.id)).send({ hostelIds: [] })
      expect(toNone.status).toBe(200)
      after = (await adminApi.get(BASE + listPath)).body.find((e) => e.id === entry.id)
      expect(after.status).toBe("unassigned")
      expect(after.activeHostelId).toBeNull()
    })

    it("400 when no update data is provided", async () => {
      const email = emailFor(label)
      await adminApi.post(BASE + createPath).send({ name: `${label} Empty`, email, password: "secret123" })
      const entry = byEmail((await adminApi.get(BASE + listPath)).body, email)
      const res = await adminApi.put(BASE + idPath(entry.id)).send({})
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/No update data provided/i)
    })

    it("404 updating an unknown id", async () => {
      const res = await adminApi.put(BASE + idPath(objectId())).send({ phone: "9222222222" })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(new RegExp(label, "i"))
    })

    it("deletes and verifies the record disappears from the list", async () => {
      const email = emailFor(label)
      await adminApi.post(BASE + createPath).send({ name: `${label} Gone`, email, password: "secret123" })
      const entry = byEmail((await adminApi.get(BASE + listPath)).body, email)
      expect(entry).toBeDefined()

      const del = await adminApi.delete(BASE + idPath(entry.id))
      expect(del.status).toBe(200)
      expect(del.body.message).toBe(deletedMessage)

      const after = (await adminApi.get(BASE + listPath)).body.find((e) => e.id === entry.id)
      expect(after).toBeUndefined()
    })

    it("404 deleting an unknown id", async () => {
      const res = await adminApi.delete(BASE + idPath(objectId()))
      expect(res.status).toBe(404)
    })
  })
}

staffRoleSuite({
  label: "Warden",
  listPath: "/wardens",
  createPath: "/warden",
  idPath: (id) => `/warden/${id}`,
  createdMessage: "Warden created successfully",
  updatedMessage: "Warden updated successfully",
  deletedMessage: "Warden deleted successfully",
})

staffRoleSuite({
  label: "Associate Warden",
  listPath: "/associate-wardens",
  createPath: "/associate-warden",
  idPath: (id) => `/associate-warden/${id}`,
  createdMessage: "Associate Warden created successfully",
  updatedMessage: "Associate Warden updated successfully",
  deletedMessage: "Associate Warden deleted successfully",
})

staffRoleSuite({
  label: "Hostel Supervisor",
  listPath: "/hostel-supervisors",
  createPath: "/hostel-supervisor",
  idPath: (id) => `/hostel-supervisor/${id}`,
  createdMessage: "Hostel Supervisor created successfully",
  updatedMessage: "Hostel Supervisor updated successfully",
  deletedMessage: "Hostel Supervisor deleted successfully",
})

// ---------------------------------------------------------------------------
// Gymkhana users — role Gymkhana + a fixed subRole allowlist; profile holds
// categories/position. Observed envelopes: POST -> { success, message };
// PUT/DELETE -> { message } only; GET -> bare array.
// ---------------------------------------------------------------------------
describe("gymkhana users", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  const payload = () => ({
    name: `Gym User ${unique()}`,
    email: emailFor("gymkhana"),
    password: "secret123",
    subRole: "GS Gymkhana",
  })

  it("400 when subRole missing / invalid, or categories invalid", async () => {
    const missing = await adminApi.post(`${BASE}/gymkhana`).send({ name: "A", email: emailFor("gymkhana") })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/Email, name, and subRole are required/i)

    const badRole = await adminApi.post(`${BASE}/gymkhana`).send({ ...payload(), subRole: "Not A Role" })
    expect(badRole.status).toBe(400)
    expect(badRole.body.message).toMatch(/Invalid Gymkhana subRole/i)

    // categories must resolve against the global gymkhana category definitions
    const badCat = await adminApi.post(`${BASE}/gymkhana`).send({ ...payload(), categories: ["Definitely Not A Category"] })
    expect(badCat.status).toBe(400)
    expect(badCat.body.message).toMatch(/Invalid Gymkhana categories/i)
  })

  it("creates, lists with categories/labels/position, rejects duplicates", async () => {
    const p = { ...payload(), categories: ["Sports"], position: "President" }
    const created = await adminApi.post(`${BASE}/gymkhana`).send(p)
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ success: true, message: "Gymkhana user created successfully" })

    const list = await adminApi.get(`${BASE}/gymkhana`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    const entry = byEmail(list.body, p.email)
    expect(entry).toBeDefined()
    expect(entry.role).toBe("Gymkhana")
    expect(entry.subRole).toBe("GS Gymkhana")
    expect(entry.categories).toContain("sports")
    expect(entry.categoryLabels).toContain("Sports")
    expect(entry.position).toBe("President")

    const dup = await adminApi.post(`${BASE}/gymkhana`).send(p)
    expect(dup.status).toBe(400)
    expect(dup.body.message).toMatch(/already exists/i)
  })

  it("updates name/subRole/categories/position and verifies via GET", async () => {
    const p = payload()
    await adminApi.post(`${BASE}/gymkhana`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)

    const res = await adminApi.put(`${BASE}/gymkhana/${entry.id}`).send({
      name: "Gym Renamed",
      subRole: "President Gymkhana",
      position: "VP",
      categories: ["Cultural"],
    })
    expect(res.status).toBe(200)
    // observed envelope: message only, no success flag
    expect(res.body.message).toBe("Gymkhana user updated successfully")

    const after = byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)
    expect(after.name).toBe("Gym Renamed")
    expect(after.subRole).toBe("President Gymkhana")
    expect(after.position).toBe("VP")
    expect(after.categories).toEqual(["cultural"])
  })

  it("400 on empty update or invalid update fields; 404 on unknown id", async () => {
    const p = payload()
    await adminApi.post(`${BASE}/gymkhana`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)

    const empty = await adminApi.put(`${BASE}/gymkhana/${entry.id}`).send({})
    expect(empty.status).toBe(400)
    expect(empty.body.message).toMatch(/No update data provided/i)

    const badSubRole = await adminApi.put(`${BASE}/gymkhana/${entry.id}`).send({ subRole: "Nope" })
    expect(badSubRole.status).toBe(400)

    const unknown = await adminApi.put(`${BASE}/gymkhana/${objectId()}`).send({ name: "X" })
    expect(unknown.status).toBe(404)
    expect(unknown.body.message).toMatch(/Gymkhana user/i)
  })

  it("deletes and verifies disappearance; 404 on unknown id", async () => {
    const p = payload()
    await adminApi.post(`${BASE}/gymkhana`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)

    const del = await adminApi.delete(`${BASE}/gymkhana/${entry.id}`)
    expect(del.status).toBe(200)
    expect(del.body.message).toBe("Gymkhana user deleted successfully")

    expect(byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)).toBeUndefined()

    const unknown = await adminApi.delete(`${BASE}/gymkhana/${objectId()}`)
    expect(unknown.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Academics users — role Academics, subRole restricted to HOD.
// ---------------------------------------------------------------------------
describe("academics users", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  const payload = () => ({
    name: `HOD ${unique()}`,
    email: emailFor("academics"),
    password: "secret123",
    subRole: "HOD",
  })

  it("400 when subRole missing / invalid", async () => {
    const missing = await adminApi.post(`${BASE}/academics`).send({ name: "A", email: emailFor("academics") })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/Email, name, and subRole are required/i)

    const bad = await adminApi.post(`${BASE}/academics`).send({ ...payload(), subRole: "Dean" })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toMatch(/Invalid Academics subRole/i)
  })

  it("creates, lists, rejects duplicate emails", async () => {
    const p = payload()
    const created = await adminApi.post(`${BASE}/academics`).send(p)
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ success: true, message: "Academics user created successfully" })

    const list = await adminApi.get(`${BASE}/academics`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    const entry = byEmail(list.body, p.email)
    expect(entry.role).toBe("Academics")
    expect(entry.subRole).toBe("HOD")

    const dup = await adminApi.post(`${BASE}/academics`).send(p)
    expect(dup.status).toBe(400)
  })

  it("updates name and verifies; 400 empty / invalid; 404 unknown id", async () => {
    const p = payload()
    await adminApi.post(`${BASE}/academics`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/academics`)).body, p.email)

    const res = await adminApi.put(`${BASE}/academics/${entry.id}`).send({ name: "Renamed HOD" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Academics user updated successfully")

    expect(byEmail((await adminApi.get(`${BASE}/academics`)).body, p.email).name).toBe("Renamed HOD")

    const empty = await adminApi.put(`${BASE}/academics/${entry.id}`).send({})
    expect(empty.status).toBe(400)

    const blankName = await adminApi.put(`${BASE}/academics/${entry.id}`).send({ name: "   " })
    expect(blankName.status).toBe(400)

    const unknown = await adminApi.put(`${BASE}/academics/${objectId()}`).send({ name: "X" })
    expect(unknown.status).toBe(404)
  })

  it("deletes and verifies disappearance; 404 on unknown id", async () => {
    const p = payload()
    await adminApi.post(`${BASE}/academics`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/academics`)).body, p.email)

    const del = await adminApi.delete(`${BASE}/academics/${entry.id}`)
    expect(del.status).toBe(200)
    expect(del.body.message).toBe("Academics user deleted successfully")

    expect(byEmail((await adminApi.get(`${BASE}/academics`)).body, p.email)).toBeUndefined()

    expect((await adminApi.delete(`${BASE}/academics/${objectId()}`)).status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Security staff — POST returns { message, security }; PUT changes
// hostelId/name; GET list is a bare array.
// ---------------------------------------------------------------------------
describe("security staff", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("400 when required fields are missing", async () => {
    const res = await adminApi.post(`${BASE}/security`).send({ email: emailFor("security"), password: "x" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Email, password, name, and hostelId are required/i)
  })

  it("creates with a hostel, lists, rejects duplicate emails", async () => {
    const hostel = await createHostel()
    const p = { name: `Guard ${unique()}`, email: emailFor("security"), password: "secret123", hostelId: String(hostel._id) }

    const created = await adminApi.post(`${BASE}/security`).send(p)
    expect(created.status).toBe(201)
    expect(created.body.message).toBe("Security created successfully")
    expect(String(created.body.security.hostelId)).toBe(String(hostel._id))
    expect(created.body.security.user.email).toBe(p.email)

    const list = await adminApi.get(`${BASE}/security`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    const entry = byEmail(list.body, p.email)
    expect(entry).toBeDefined()
    expect(String(entry.hostelId)).toBe(String(hostel._id))

    const dup = await adminApi.post(`${BASE}/security`).send(p)
    expect(dup.status).toBe(400)
  })

  it("updates hostelId + name and verifies; 404 on unknown id", async () => {
    const hostelA = await createHostel()
    const hostelB = await createHostel()
    const p = { name: `Guard ${unique()}`, email: emailFor("security"), password: "secret123", hostelId: String(hostelA._id) }
    await adminApi.post(`${BASE}/security`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/security`)).body, p.email)

    const res = await adminApi.put(`${BASE}/security/${entry.id}`).send({ hostelId: String(hostelB._id), name: "Renamed Guard" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Security updated successfully")

    const after = (await adminApi.get(`${BASE}/security`)).body.find((e) => e.id === entry.id)
    expect(after.name).toBe("Renamed Guard")
    expect(String(after.hostelId)).toBe(String(hostelB._id))

    expect((await adminApi.put(`${BASE}/security/${objectId()}`).send({ name: "X" })).status).toBe(404)
  })

  it("deletes and verifies disappearance; 404 on unknown id", async () => {
    const hostel = await createHostel()
    const p = { name: `Guard ${unique()}`, email: emailFor("security"), password: "secret123", hostelId: String(hostel._id) }
    await adminApi.post(`${BASE}/security`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/security`)).body, p.email)

    const del = await adminApi.delete(`${BASE}/security/${entry.id}`)
    expect(del.status).toBe(200)
    expect(del.body.message).toBe("Security deleted successfully")

    expect(byEmail((await adminApi.get(`${BASE}/security`)).body, p.email)).toBeUndefined()

    expect((await adminApi.delete(`${BASE}/security/${objectId()}`)).status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Maintenance staff + per-staff stats.
// ---------------------------------------------------------------------------
describe("maintenance staff", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("400 when category missing; 400 on duplicate email", async () => {
    const missing = await adminApi.post(`${BASE}/maintenance`).send({ name: "A", email: emailFor("maintenance") })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/Email, password, name, and category are required/i)

    const p = { name: "Tech", email: emailFor("maintenance"), password: "secret123", category: "Plumbing" }
    expect((await adminApi.post(`${BASE}/maintenance`).send(p)).status).toBe(201)
    expect((await adminApi.post(`${BASE}/maintenance`).send(p)).status).toBe(400)
  })

  it("creates, lists with category, updates category+phone, deletes", async () => {
    const p = { name: "Tech One", email: emailFor("maintenance"), password: "secret123", category: "Electrical" }
    const created = await adminApi.post(`${BASE}/maintenance`).send(p)
    expect(created.status).toBe(201)
    expect(created.body).toEqual({ success: true, message: "Maintenance staff created successfully" })

    const list = await adminApi.get(`${BASE}/maintenance`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)
    const entry = byEmail(list.body, p.email)
    expect(entry.category).toBe("Electrical")

    const res = await adminApi.put(`${BASE}/maintenance/${entry.id}`).send({ category: "Carpentry", phone: "9333333333" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Maintenance staff updated successfully")

    const after = (await adminApi.get(`${BASE}/maintenance`)).body.find((e) => e.id === entry.id)
    expect(after.category).toBe("Carpentry")
    expect(after.phone).toBe("9333333333")

    const del = await adminApi.delete(`${BASE}/maintenance/${entry.id}`)
    expect(del.status).toBe(200)
    expect(byEmail((await adminApi.get(`${BASE}/maintenance`)).body, p.email)).toBeUndefined()
  })

  // SUSPECTED BUG (inconsistency): every other group answers an empty-body PUT
  // with 400 "No update data provided", but maintenance runs
  // updateById(MaintenanceStaff, id, {}) unconditionally, so an empty update
  // succeeds with 200. Documenting current behavior.
  it("empty-body PUT succeeds (no 'no update data' guard) — documents current behavior", async () => {
    const p = { name: "Tech Two", email: emailFor("maintenance"), password: "secret123", category: "Plumbing" }
    await adminApi.post(`${BASE}/maintenance`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/maintenance`)).body, p.email)
    const res = await adminApi.put(`${BASE}/maintenance/${entry.id}`).send({})
    expect(res.status).toBe(200)
  })

  it("404 updating/deleting an unknown id", async () => {
    expect((await adminApi.put(`${BASE}/maintenance/${objectId()}`).send({ category: "X" })).status).toBe(404)
    expect((await adminApi.delete(`${BASE}/maintenance/${objectId()}`)).status).toBe(404)
  })

  it("GET /maintenance-staff-stats/:staffId reports zeroed counts for a fresh staff member", async () => {
    const p = { name: "Stats Tech", email: emailFor("maintenance"), password: "secret123", category: "Plumbing" }
    await adminApi.post(`${BASE}/maintenance`).send(p)
    const entry = byEmail((await adminApi.get(`${BASE}/maintenance`)).body, p.email)

    const res = await adminApi.get(`${BASE}/maintenance-staff-stats/${entry.userId}`)
    expect(res.status).toBe(200)
    // observed envelope: { success, data } — no message field
    expect(res.body.success).toBe(true)
    expect(res.body.data.totalWorkDone).toBe(0)
    expect(res.body.data.todayWorkDone).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Hostel gate logins — keyed by hostelId, one gate per hostel.
// ---------------------------------------------------------------------------
describe("hostel gates", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("404 creating a gate for an unknown hostel", async () => {
    const res = await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: objectId(), password: "gate-pass" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/Hostel not found/i)
  })

  // SUSPECTED BUG: a missing password reaches bcrypt.hash(undefined) and blows
  // up into a caught-but-500 response instead of a 400 validation error:
  // POST /admin/hostel-gate {} -> 500 { message } today.
  it("missing password surfaces as a server error (documents current behavior)", async () => {
    const hostel = await createHostel()
    const res = await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: String(hostel._id) })
    expect(res.status).toBe(500)
  })

  it("create → conflict on duplicate → list shows populated gate", async () => {
    const hostel = await createHostel()
    const created = await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: String(hostel._id), password: "gate-pass" })
    expect(created.status).toBe(201)
    // SUSPECTED BUG (envelope): createHostelGate builds success({ message }) and
    // the controller sends only result.data, so the 201 body is `{}` and the
    // "Hostel gate created successfully" message never reaches the client.
    expect(created.body).toEqual({})

    const dup = await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: String(hostel._id), password: "gate-pass2" })
    expect(dup.status).toBe(409)
    expect(dup.body.message).toMatch(/already exists/i)

    const list = await adminApi.get(`${BASE}/hostel-gate/all`)
    expect(list.status).toBe(200)
    // observed envelope: { hostelGates: [...] } — not the standard data key
    const gate = list.body.hostelGates.find((g) => String(g.hostelId?._id ?? g.hostelId) === String(hostel._id))
    expect(gate).toBeDefined()
    expect(gate.userId.email).toBe(`${hostel.name.toLowerCase()}.gate.login@iiti.ac.in`)
    expect(gate.hostelId.name).toBe(hostel.name)
  })

  it("update rotates the gate password; 404 on unknown hostel", async () => {
    const hostel = await createHostel()
    await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: String(hostel._id), password: "first-pass" })

    const res = await adminApi.put(`${BASE}/hostel-gate/${hostel._id}`).send({ password: "second-pass" })
    expect(res.status).toBe(200)
    // same lost-message envelope as create: success body is `{}`
    expect(res.body).toEqual({})

    const unknown = await adminApi.put(`${BASE}/hostel-gate/${objectId()}`).send({ password: "x" })
    expect(unknown.status).toBe(404)
    expect(unknown.body.message).toMatch(/Hostel gate not found/i)
  })

  it("delete removes the gate; 404 on unknown hostel", async () => {
    const hostel = await createHostel()
    await adminApi.post(`${BASE}/hostel-gate`).send({ hostelId: String(hostel._id), password: "doomed" })

    const del = await adminApi.delete(`${BASE}/hostel-gate/${hostel._id}`)
    expect(del.status).toBe(200)
    expect(del.body).toEqual({})

    const remaining = (await adminApi.get(`${BASE}/hostel-gate/all`)).body.hostelGates
    expect(remaining.find((g) => String(g.hostelId?._id ?? g.hostelId) === String(hostel._id))).toBeUndefined()

    expect((await adminApi.delete(`${BASE}/hostel-gate/${objectId()}`)).status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// Hardening additions — creation edge cases across the staff groups.
// ---------------------------------------------------------------------------
describe("staff creation hardening — unknown fields, email case, phone format", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("warden create silently drops unknown/extra fields; PUT with only unknown keys is still 400", async () => {
    const email = emailFor("warden")
    // `role`/`subRole` are NOT part of the warden create contract — a client
    // sending them must not be able to influence the created user's role.
    const res = await adminApi.post(BASE + "/warden").send({
      name: "Extra Fields Warden",
      email,
      password: "secret123",
      role: "Admin",
      subRole: "HCU",
      bogusField: { nested: true },
    })
    expect(res.status).toBe(201)

    const entry = byEmail((await adminApi.get(`${BASE}/wardens`)).body, email)
    expect(entry).toBeDefined()
    expect(entry.name).toBe("Extra Fields Warden")

    // The update path confirms strict-schema behavior from the API side:
    // an unknown-only payload is treated as "no update data" rather than
    // being accepted or crashing.
    const put = await adminApi.put(BASE + `/warden/${entry.id}`).send({ bogusField: 1 })
    expect(put.status).toBe(400)
    expect(put.body.message).toMatch(/No update data provided/i)
  })

  it("duplicate emails are caught case-insensitively (warden)", async () => {
    const email = `Mixed.Case-Warden-${unique()}@HMS.Test`
    expect(
      (await adminApi.post(BASE + "/warden").send({ name: "Case One", email, password: "secret123" })).status,
    ).toBe(201)

    const lower = await adminApi.post(BASE + "/warden").send({
      name: "Case Two",
      email: email.toLowerCase(),
      password: "secret123",
    })
    expect(lower.status).toBe(400)
    expect(lower.body.message).toMatch(/already exists/i)
  })

  it("duplicate emails are caught case-insensitively (maintenance + gymkhana)", async () => {
    const maintEmail = `Maint.Dup-${unique()}@HMS.Test`
    expect(
      (
        await adminApi.post(`${BASE}/maintenance`).send({
          name: "Maint Dup",
          email: maintEmail,
          password: "secret123",
          category: "Plumbing",
        })
      ).status,
    ).toBe(201)
    const maintDup = await adminApi.post(`${BASE}/maintenance`).send({
      name: "Maint Dup Two",
      email: maintEmail.toUpperCase(),
      password: "secret123",
      category: "Plumbing",
    })
    expect(maintDup.status).toBe(400)

    const gymPayload = {
      name: `Gym Dup ${unique()}`,
      email: `gym-dup-${unique()}@hms.test`,
      password: "secret123",
      subRole: "GS Gymkhana",
    }
    expect((await adminApi.post(`${BASE}/gymkhana`).send(gymPayload)).status).toBe(201)
    const gymDup = await adminApi
      .post(`${BASE}/gymkhana`)
      .send({ ...gymPayload, email: gymPayload.email.toUpperCase() })
    expect(gymDup.status).toBe(400)
    expect(gymDup.body.message).toMatch(/already exists/i)
  })

  it("phone numbers are stored verbatim with no format validation (documents current behavior)", async () => {
    const email = emailFor("associate-warden")
    const phone = "+++not-a-phone##"
    const res = await adminApi.post(BASE + "/associate-warden").send({
      name: "Weird Phone AW",
      email,
      password: "secret123",
      phone,
    })
    expect(res.status).toBe(201)

    const entry = byEmail((await adminApi.get(`${BASE}/associate-wardens`)).body, email)
    expect(entry.phone).toBe(phone)
  })

  // SUSPECTED BUG: neither createWarden nor the service validates that the ids
  // in hostelIds reference real hostels. A well-formed but nonexistent ObjectId
  // produces status "assigned", activeHostelId pointing at a ghost hostel, and
  // the warden is listed as assigned to hostels that do not exist.
  it("warden-family hostelIds containing unknown hostel ids are accepted as 'assigned' (documents current behavior)", async () => {
    const ghostA = objectId()
    const ghostB = objectId()
    const email = emailFor("warden")
    const res = await adminApi.post(BASE + "/warden").send({
      name: "Ghost Hostel Warden",
      email,
      password: "secret123",
      hostelIds: [ghostA, ghostB],
    })
    expect(res.status).toBe(201)

    const entry = byEmail((await adminApi.get(`${BASE}/wardens`)).body, email)
    expect(entry.status).toBe("assigned")
    expect(entry.hostelIds.map(String)).toEqual([ghostA, ghostB])
    expect(String(entry.activeHostelId)).toBe(ghostA)
  })

  it("gymkhana multi-category payloads dedupe case variants and resolve object-form entries", async () => {
    const p = {
      name: `Gym MultiCat ${unique()}`,
      email: emailFor("gymkhana"),
      password: "secret123",
      subRole: "Club",
      categories: ["Sports", "sports", "SPORTS", { key: "cultural" }, { label: "Technical" }, "Cultural"],
    }
    const created = await adminApi.post(`${BASE}/gymkhana`).send(p)
    expect(created.status).toBe(201)

    const entry = byEmail((await adminApi.get(`${BASE}/gymkhana`)).body, p.email)
    // first-appearance order after dedupe against the normalized key set
    expect(entry.categories).toEqual(["sports", "cultural", "technical"])
    expect([...entry.categoryLabels].sort()).toEqual(["Cultural", "Sports", "Technical"])
  })

  it("gymkhana rejects a payload mixing valid and invalid categories", async () => {
    const res = await adminApi.post(`${BASE}/gymkhana`).send({
      name: `Gym MixedCat ${unique()}`,
      email: emailFor("gymkhana"),
      password: "secret123",
      subRole: "Committee",
      categories: ["Sports", "Not Real Category", "Cultural"],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Invalid Gymkhana categories: Not Real Category/)
  })

  it("security staff: delete-then-recreate with the same email succeeds", async () => {
    const hostel = await createHostel()
    const email = emailFor("security")
    const first = await adminApi.post(`${BASE}/security`).send({
      name: "Recycled Guard",
      email,
      password: "secret123",
      hostelId: String(hostel._id),
    })
    expect(first.status).toBe(201)

    const del = await adminApi.delete(`${BASE}/security/${first.body.security._id}`)
    expect(del.status).toBe(200)

    const second = await adminApi.post(`${BASE}/security`).send({
      name: "Recycled Guard II",
      email,
      password: "secret123",
      hostelId: String(hostel._id),
    })
    expect(second.status).toBe(201)
    // a genuinely new record was created, not a resurrect of the old one
    expect(String(second.body.security._id)).not.toBe(String(first.body.security._id))

    const list = (await adminApi.get(`${BASE}/security`)).body
    expect(list.filter((e) => e.email.toLowerCase() === email.toLowerCase())).toHaveLength(1)
  })
})

