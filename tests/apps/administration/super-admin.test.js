/**
 * Integration tests for the Super Admin module.
 * Base path: /api/v1/super-admin
 *
 * NOTE on envelopes: unlike most modules, this controller sends
 * `result.data` directly (see sendResponse in super-admin.controller.js), so
 * success bodies are NOT wrapped in { success, data } — except GET /profile,
 * which hand-rolls `{ success, data: { profile } }`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import crypto from "node:crypto"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { ADMIN_SUBROLES, SUBROLES } from "../../../src/core/constants/roles.constants.js"

const BASE = "/api/v1/super-admin"

beforeAll(async () => {
  await setupTestDb()
  // setupTestDb drops collections AND indexes; rebuild ApiClient's unique
  // name index so duplicate-name conflicts behave like prod.
  const { ApiClient } = await import("../../../src/models/index.js")
  await ApiClient.syncIndexes()
})

afterAll(async () => {
  await teardownTestDb()
})

const randomObjectId = () => crypto.randomBytes(12).toString("hex")

describe("Role gating & authentication", () => {
  it("401 for unauthenticated requests on every route area", async () => {
    const api = await anon()
    for (const [method, path] of [
      ["get", `${BASE}/profile`],
      ["get", `${BASE}/dashboard`],
      ["get", `${BASE}/admins`],
      ["post", `${BASE}/admins`],
      ["put", `${BASE}/admins/${randomObjectId()}`],
      ["delete", `${BASE}/admins/${randomObjectId()}`],
      ["get", `${BASE}/api-clients`],
      ["post", `${BASE}/api-clients`],
      ["put", `${BASE}/api-clients/${randomObjectId()}`],
      ["delete", `${BASE}/api-clients/${randomObjectId()}`],
    ]) {
      const res = await api[method](path).send({})
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    }
  })

  it("403 for wrong roles (Warden, Student) — Super Admin/Admin only", async () => {
    const warden = await seed.warden()
    const student = await seed.student()
    const wardenApi = await as(warden)
    const studentApi = await as(student)

    for (const api of [wardenApi, studentApi]) {
      const dash = await api.get(`${BASE}/dashboard`)
      expect(dash.status).toBe(403)
      expect(dash.body.success).toBe(false)
      expect(dash.body.message).toMatch(/Access denied/i)

      const admins = await api.get(`${BASE}/admins`)
      expect(admins.status).toBe(403)

      const clients = await api.get(`${BASE}/api-clients`)
      expect(clients.status).toBe(403)
    }
  })
})

describe("GET /super-admin/profile", () => {
  it("returns the session profile for a Super Admin", async () => {
    const superAdmin = await seed.superAdmin()
    const api = await as(superAdmin)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(200)
    // Hand-rolled route keeps the standard envelope
    expect(res.body.success).toBe(true)
    expect(res.body.data.profile.email).toBe(superAdmin.email)
    expect(res.body.data.profile.role).toBe("Super Admin")
  })

  it("SUSPECTED BUG: plain Admin gets 403 because the route hard-requires the superAdmin.profile authz key", async () => {
    // The route sits behind authorizeRoles(['Super Admin','Admin']) but then
    // calls requireRouteAccess('route.superAdmin.profile') for every caller.
    // An Admin's effective authz only contains route.admin.* keys, so Admins
    // are denied even though the router nominally admits them. Documenting
    // current behavior.
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/do not have access/i)
  })
})

describe("GET /super-admin/dashboard", () => {
  it("returns stats counters that track created admins and api clients", async () => {
    const superAdmin = await seed.superAdmin()
    const api = await as(superAdmin)

    const before = await api.get(`${BASE}/dashboard`)
    expect(before.status).toBe(200)
    expect(typeof before.body.totalAdmins).toBe("number")
    expect(typeof before.body.totalApiKeys).toBe("number")
    expect(typeof before.body.activeApiKeys).toBe("number")

    await seed.admin({ subRole: SUBROLES.HCU })

    const clientName = `dash-client-${crypto.randomBytes(4).toString("hex")}`
    const created = await api.post(`${BASE}/api-clients`).send({ name: clientName })
    expect(created.status).toBe(201)

    const after = await api.get(`${BASE}/dashboard`)
    expect(after.status).toBe(200)
    expect(after.body.totalAdmins).toBe(before.body.totalAdmins + 1)
    expect(after.body.totalApiKeys).toBe(before.body.totalApiKeys + 1)
    expect(after.body.activeApiKeys).toBe(before.body.activeApiKeys + 1)
  })
})

describe("API client management (/super-admin/api-clients)", () => {
  let superAdmin, api

  beforeAll(async () => {
    superAdmin = await seed.superAdmin()
    api = await as(superAdmin)
  })

  it("400 when name is missing on create", async () => {
    const res = await api.post(`${BASE}/api-clients`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Name is required/i)
  })

  it("creates a client and returns one-time plaintext key material (201)", async () => {
    const res = await api.post(`${BASE}/api-clients`).send({
      name: "integration-client-1",
      expiresAt: "2030-01-01T00:00:00.000Z",
    })
    expect(res.status).toBe(201)
    // NOTE: the service's "created successfully" message is stripped by the
    // controller's sendResponse (envelope double-wrap) — only data reaches
    // the client: { clientId, apiKey }.
    expect(res.body.clientId).toBeTruthy()
    // key material: 32 random bytes hex-encoded
    expect(res.body.apiKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it("lists clients including the created one (key material is exposed in list output)", async () => {
    const res = await api.get(`${BASE}/api-clients`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    const client = res.body.find((c) => c.name === "integration-client-1")
    expect(client).toBeTruthy()
    expect(client.isActive).toBe(true)
    expect(client.expiresAt).toBe("2030-01-01T00:00:00.000Z")
    // Current behavior: the plaintext apiKey is returned by the listing too.
    expect(client.apiKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it("409 conflict when creating a client with a duplicate name", async () => {
    const res = await api.post(`${BASE}/api-clients`).send({ name: "integration-client-1" })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/already exists/i)
  })

  it("updates isActive via PUT and reflects it in the listing and dashboard counters", async () => {
    const list = await api.get(`${BASE}/api-clients`)
    const client = list.body.find((c) => c.name === "integration-client-1")

    const statsBefore = await api.get(`${BASE}/dashboard`)

    const res = await api.put(`${BASE}/api-clients/${client._id}`).send({ isActive: false })
    expect(res.status).toBe(200)
    // message is stripped by sendResponse; body is { updatedClient }
    expect(res.body.updatedClient.isActive).toBe(false)

    const afterList = await api.get(`${BASE}/api-clients`)
    expect(afterList.body.find((c) => c._id === client._id).isActive).toBe(false)

    const statsAfter = await api.get(`${BASE}/dashboard`)
    expect(statsAfter.body.activeApiKeys).toBe(statsBefore.body.activeApiKeys - 1)
  })

  it("SUSPECTED BUG: PUT for an unknown client id returns 200 success with null updatedClient", async () => {
    const res = await api.put(`${BASE}/api-clients/${randomObjectId()}`).send({ isActive: false })
    expect(res.status).toBe(200) // current behavior; arguably should be 404
    expect(res.body.updatedClient).toBeNull()
  })

  it("deletes a client and verifies removal through the listing", async () => {
    const list = await api.get(`${BASE}/api-clients`)
    const client = list.body.find((c) => c.name === "integration-client-1")

    const del = await api.delete(`${BASE}/api-clients/${client._id}`)
    expect(del.status).toBe(200)
    // message is stripped by sendResponse — body is empty ({})
    expect(del.body).toEqual({})

    const after = await api.get(`${BASE}/api-clients`)
    expect(after.body.find((c) => c._id === client._id)).toBeUndefined()
  })

  it("SUSPECTED BUG: DELETE for an unknown client id still returns 200 success", async () => {
    const res = await api.delete(`${BASE}/api-clients/${randomObjectId()}`)
    expect(res.status).toBe(200) // current behavior; findByIdAndDelete(null result) is not surfaced
    expect(res.body).toEqual({})
  })
})

describe("Admin management (/super-admin/admins)", () => {
  let superAdmin, api

  beforeAll(async () => {
    superAdmin = await seed.superAdmin()
    api = await as(superAdmin)
  })

  it("400 when name or email is missing", async () => {
    const noName = await api.post(`${BASE}/admins`).send({ email: "x@hms.test", subRole: SUBROLES.HCU })
    expect(noName.status).toBe(400)
    expect(noName.body.message).toMatch(/Name and email are required/i)

    const noEmail = await api.post(`${BASE}/admins`).send({ name: "X", subRole: SUBROLES.HCU })
    expect(noEmail.status).toBe(400)
  })

  it("400 when subRole is missing or invalid for a Super Admin actor", async () => {
    const missing = await api.post(`${BASE}/admins`).send({ name: "A", email: "a@hms.test" })
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/subRole is required/i)

    const invalid = await api
      .post(`${BASE}/admins`)
      .send({ name: "B", email: "b@hms.test", subRole: "Not A Subrole" })
    expect(invalid.status).toBe(400)
    expect(invalid.body.message).toMatch(/Invalid admin subRole/i)
  })

  it("creates admins for every valid subRole and verifies persistence via GET /admins", async () => {
    const suffix = crypto.randomBytes(4).toString("hex")
    const createdIds = []

    for (const subRole of ADMIN_SUBROLES) {
      const res = await api.post(`${BASE}/admins`).send({
        name: `Admin ${subRole} ${suffix}`,
        email: `${subRole.toLowerCase().replace(/\s+/g, "-")}-${suffix}@hms.test`,
        password: "secret-password",
        phone: "9999999999",
        category: subRole === SUBROLES.HCU ? undefined : "Custom Category",
        subRole,
      })
      expect(res.status).toBe(201)
      // message is stripped by sendResponse — body is { adminId }
      expect(res.body.adminId).toBeTruthy()
      createdIds.push(res.body.adminId)
    }

    const list = await api.get(`${BASE}/admins`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body)).toBe(true)

    for (const [i, subRole] of ADMIN_SUBROLES.entries()) {
      const row = list.body.find((u) => u.email === `${subRole.toLowerCase().replace(/\s+/g, "-")}-${suffix}@hms.test`)
      expect(row, `admin with subRole ${subRole} should be listed`).toBeTruthy()
      expect(String(row._id)).toBe(String(createdIds[i]))
      expect(row.role).toBe("Admin")
      expect(row.subRole).toBe(subRole)
      // category falls back to HCU for HCU, 'Admin' otherwise was overridden above
      if (subRole === SUBROLES.HCU) expect(row.category).toBe("HCU")
      else expect(row.category).toBe("Custom Category")
      // password must never leak
      expect(row.password).toBeUndefined()
    }
  })

  it("400 when the email already exists (case-insensitive)", async () => {
    const existing = await seed.admin({ subRole: SUBROLES.HCU })
    const res = await api
      .post(`${BASE}/admins`)
      .send({ name: "Dup", email: existing.email.toUpperCase(), subRole: SUBROLES.HCU })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already exists/i)
  })

  it("updates an admin (name/phone/category) and reflects changes via GET /admins", async () => {
    const target = await seed.admin({ subRole: SUBROLES.STUDENT_AFFAIRS })
    const res = await api.put(`${BASE}/admins/${target._id}`).send({
      name: "Renamed Admin",
      phone: "1234567890",
      category: "Updated Category",
    })
    expect(res.status).toBe(200)
    // message is stripped by sendResponse — body is { response }
    expect(res.body.response.name).toBe("Renamed Admin")
    expect(res.body.response.phone).toBe("1234567890")
    expect(res.body.response.category).toBe("Updated Category")

    const list = await api.get(`${BASE}/admins`)
    const row = list.body.find((u) => String(u._id) === String(target._id))
    expect(row.name).toBe("Renamed Admin")
    expect(row.category).toBe("Updated Category")
  })

  it("400 on empty name/email updates, 400 on duplicate email of another user", async () => {
    const target = await seed.admin({ subRole: SUBROLES.OFFICER_SA })
    const other = await seed.admin({ subRole: SUBROLES.OFFICER_SA })

    const emptyName = await api.put(`${BASE}/admins/${target._id}`).send({ name: "   " })
    expect(emptyName.status).toBe(400)
    expect(emptyName.body.message).toMatch(/Name cannot be empty/i)

    const emptyEmail = await api.put(`${BASE}/admins/${target._id}`).send({ email: "" })
    expect(emptyEmail.status).toBe(400)

    const dup = await api.put(`${BASE}/admins/${target._id}`).send({ email: other.email })
    expect(dup.status).toBe(400)
    expect(dup.body.message).toMatch(/already exists/i)
  })

  it("404 updating/deleting an unknown admin id", async () => {
    const upd = await api.put(`${BASE}/admins/${randomObjectId()}`).send({ name: "Ghost" })
    expect(upd.status).toBe(404)
    expect(upd.body.message).toMatch(/Admin not found/i)

    const del = await api.delete(`${BASE}/admins/${randomObjectId()}`)
    expect(del.status).toBe(404)
  })

  it("deletes an admin and verifies removal via GET /admins", async () => {
    const target = await seed.admin({ subRole: SUBROLES.ACCOUNTANT })
    const res = await api.delete(`${BASE}/admins/${target._id}`)
    expect(res.status).toBe(200)
    // message is stripped by sendResponse — body is empty ({})
    expect(res.body).toEqual({})

    const list = await api.get(`${BASE}/admins`)
    expect(list.body.find((u) => String(u._id) === String(target._id))).toBeUndefined()
  })
})

describe("Admin-actor scoping (plain Admin manages HCU, CWO, Accountant, Chief Warden)", () => {
  let hcuActor, hcuApi

  beforeAll(async () => {
    hcuActor = await seed.admin({ subRole: SUBROLES.HCU })
    hcuApi = await as(hcuActor)
  })

  it("403 when an Admin tries to create a Student Affairs subRole account", async () => {
    const res = await hcuApi
      .post(`${BASE}/admins`)
      .send({ name: "SA Admin", email: "sa-scoped@hms.test", subRole: SUBROLES.STUDENT_AFFAIRS })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/HCU/i)
  })

  it("creates an HCU account without explicit subRole and lists HCU-managed subroles only", async () => {
    const nonHcu = await seed.admin({ subRole: SUBROLES.DEAN_SA })
    const res = await hcuApi
      .post(`${BASE}/admins`)
      .send({ name: "Scoped HCU Admin", email: "scoped-hcu@hms.test" })
    expect(res.status).toBe(201)

    const list = await hcuApi.get(`${BASE}/admins`)
    expect(list.status).toBe(200)
    const emails = list.body.map((u) => u.email)
    expect(emails).toContain("scoped-hcu@hms.test")
    expect(emails).not.toContain(nonHcu.email)
    for (const row of list.body) {
      expect([
        SUBROLES.HCU,
        SUBROLES.CHIEF_WARDEN_OFFICE,
        SUBROLES.ACCOUNTANT,
        SUBROLES.CHIEF_WARDEN,
      ]).toContain(row.subRole)
    }
  })

  it("creates Chief Warden Office, Accountant, and Chief Warden accounts", async () => {
    for (const subRole of [SUBROLES.CHIEF_WARDEN_OFFICE, SUBROLES.ACCOUNTANT, SUBROLES.CHIEF_WARDEN]) {
      const email = `${subRole.replace(/\s+/g, "-").toLowerCase()}@hms.test`
      const res = await hcuApi.post(`${BASE}/admins`).send({
        name: subRole,
        email,
        subRole,
      })
      expect(res.status).toBe(201)
    }

    const list = await hcuApi.get(`${BASE}/admins`)
    const byEmail = (email) => list.body.find((u) => u.email === email)
    expect(byEmail("chief-warden-office@hms.test").subRole).toBe(SUBROLES.CHIEF_WARDEN_OFFICE)
    expect(byEmail("accountant@hms.test").subRole).toBe(SUBROLES.ACCOUNTANT)
    expect(byEmail("chief-warden@hms.test").subRole).toBe(SUBROLES.CHIEF_WARDEN)
  })

  it("403 when an Admin updates/deletes a Student Affairs admin", async () => {
    const nonHcu = await seed.admin({ subRole: SUBROLES.STUDENT_AFFAIRS })

    const upd = await hcuApi.put(`${BASE}/admins/${nonHcu._id}`).send({ name: "Nope" })
    expect(upd.status).toBe(403)
    expect(upd.body.message).toMatch(/HCU/i)

    const del = await hcuApi.delete(`${BASE}/admins/${nonHcu._id}`)
    expect(del.status).toBe(403)
  })

  it("an Admin updating an HCU account keeps its subRole when omitted", async () => {
    const hcuTarget = await seed.admin({ subRole: SUBROLES.HCU })
    const res = await hcuApi.put(`${BASE}/admins/${hcuTarget._id}`).send({
      name: "HCU Renamed",
      phone: "7778889990",
    })
    expect(res.status).toBe(200)
    expect(res.body.response.subRole).toBe(SUBROLES.HCU)
    expect(res.body.response.name).toBe("HCU Renamed")
  })

  it("an Admin can change an HCU account to Chief Warden and persist a profile image", async () => {
    const hcuTarget = await seed.admin({ subRole: SUBROLES.HCU })
    const res = await hcuApi.put(`${BASE}/admins/${hcuTarget._id}`).send({
      subRole: SUBROLES.CHIEF_WARDEN,
      profileImage: "media://hcu-profile",
    })
    expect(res.status).toBe(200)
    expect(res.body.response.subRole).toBe(SUBROLES.CHIEF_WARDEN)
    expect(res.body.response.profileImage).toBe("media://hcu-profile")
  })

  it("403 when an Admin tries to re-scope an HCU account to Student Affairs", async () => {
    const hcuTarget = await seed.admin({ subRole: SUBROLES.HCU })
    const res = await hcuApi
      .put(`${BASE}/admins/${hcuTarget._id}`)
      .send({ subRole: SUBROLES.DEAN_SA })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/HCU/i)
  })
})

describe("Dashboard counter consistency across create/delete cycles", () => {
  it("counters return to their baseline after creating and deleting an admin and an api client", async () => {
    const superAdmin = await seed.superAdmin()
    const api = await as(superAdmin)

    const base = await api.get(`${BASE}/dashboard`)
    expect(base.status).toBe(200)

    // create one of each
    const admin = await seed.admin({ subRole: SUBROLES.HCU })
    const clientName = `cycle-client-${crypto.randomBytes(4).toString("hex")}`
    const created = await api.post(`${BASE}/api-clients`).send({ name: clientName })
    expect(created.status).toBe(201)

    const peak = await api.get(`${BASE}/dashboard`)
    expect(peak.body.totalAdmins).toBe(base.body.totalAdmins + 1)
    expect(peak.body.totalApiKeys).toBe(base.body.totalApiKeys + 1)
    expect(peak.body.activeApiKeys).toBe(base.body.activeApiKeys + 1)

    // deactivate the client: total stays, active drops before delete
    const deact = await api.put(`${BASE}/api-clients/${created.body.clientId}`).send({ isActive: false })
    expect(deact.status).toBe(200)
    const mid = await api.get(`${BASE}/dashboard`)
    expect(mid.body.totalApiKeys).toBe(peak.body.totalApiKeys)
    expect(mid.body.activeApiKeys).toBe(peak.body.activeApiKeys - 1)

    // delete both -> back to baseline
    const delClient = await api.delete(`${BASE}/api-clients/${created.body.clientId}`)
    expect(delClient.status).toBe(200)
    const delAdmin = await api.delete(`${BASE}/admins/${admin._id}`)
    expect(delAdmin.status).toBe(200)

    const end = await api.get(`${BASE}/dashboard`)
    expect(end.body.totalAdmins).toBe(base.body.totalAdmins)
    expect(end.body.totalApiKeys).toBe(base.body.totalApiKeys)
    expect(end.body.activeApiKeys).toBe(base.body.activeApiKeys)
  })
})

describe("Admin email conflict edges on update", () => {
  let api

  beforeAll(async () => {
    const superAdmin = await seed.superAdmin()
    api = await as(superAdmin)
  })

  it("updating an admin to their own current email succeeds (self is excluded from the dup check)", async () => {
    const target = await seed.admin({ subRole: SUBROLES.OFFICER_SA })
    const res = await api.put(`${BASE}/admins/${target._id}`).send({
      name: "Same Email Self",
      email: target.email,
    })
    expect(res.status).toBe(200)
    expect(res.body.response.email).toBe(target.email.toLowerCase())

    const list = await api.get(`${BASE}/admins`)
    const row = list.body.find((u) => String(u._id) === String(target._id))
    expect(row.name).toBe("Same Email Self")
  })

  it("400 when the new email matches another user case-insensitively", async () => {
    const target = await seed.admin({ subRole: SUBROLES.OFFICER_SA })
    const other = await seed.admin({ subRole: SUBROLES.OFFICER_SA })

    const res = await api.put(`${BASE}/admins/${target._id}`).send({
      email: other.email.toUpperCase(),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already exists/i)

    // nothing changed on the target
    const list = await api.get(`${BASE}/admins`)
    const row = list.body.find((u) => String(u._id) === String(target._id))
    expect(row.email).toBe(target.email.toLowerCase())
  })

  it("404 when updating a user id that exists but is not an Admin role", async () => {
    const student = await seed.student()
    const res = await api.put(`${BASE}/admins/${student._id}`).send({ name: "Not An Admin" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/Admin not found/i)
  })
})
