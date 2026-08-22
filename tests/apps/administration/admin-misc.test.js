/**
 * Integration tests for the MISC portion of the admin module
 * (src/apps/administration/modules/admin/admin.routes.js):
 *   - GET  /hostel/list                      (any authenticated user)
 *   - GET  /profile                          (Admin)
 *   - Insurance providers CRUD + bulk-student-update (Admin)
 *   - Student health GET/PUT                 (Admin)
 *   - Insurance claims CRUD                  (Admin)
 *   - POST /user/update-password             (Admin)
 *   - GET  /task-stats                       (Admin)
 *
 * NOTE on envelopes: these legacy controllers do NOT use the standard
 * { success, message, data } wrapper — each controller serializes
 * `result.data` (or `{ message }` / `{ message, error }`) directly. The shapes
 * asserted below are the ones actually observed from the app.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import bcrypt from "bcrypt"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createHostel,
  createStudentProfile,
  createTask,
  createUnit,
  createRoom,
} from "../../helpers/seed/operations.js"
// this variant also links StudentProfile.currentRoomAllocation, which the
// hostel-scope filter needs to see the student
import { createAllocation } from "../../helpers/seed/students.js"

const BASE = "/api/v1/admin"

let admin
let student
let adminApi
let studentApi
let anonApi

beforeAll(async () => {
  await setupTestDb()
  admin = await seed.admin()
  student = await seed.student()
  adminApi = await as(admin)
  studentApi = await as(student)
  anonApi = await anon()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---------------------------------------------------------------------------
// Small assertion helpers for the shared auth gates.
// ---------------------------------------------------------------------------

async function assert401(method, url, body) {
  const req = anonApi[method](url)
  if (body) req.send(body)
  const res = await req
  expect(res.status, `${method.toUpperCase()} ${url} -> 401`).toBe(401)
  expect(res.body.success).toBe(false)
}

async function assert403(method, url, body) {
  const req = studentApi[method](url)
  if (body) req.send(body)
  const res = await req
  expect(res.status, `${method.toUpperCase()} ${url} -> 403 as student`).toBe(403)
  expect(res.body.success).toBe(false)
  expect(res.body.message).toMatch(/access denied/i)
}

/** Valid insurance-provider payload with unique-ish fields. */
function providerPayload(overrides = {}) {
  return {
    name: `Provider ${Math.random().toString(36).slice(2, 8)}`,
    email: `claims-${Math.random().toString(36).slice(2, 8)}@provider.test`,
    phone: "9876543210",
    address: "12 Coverage Road",
    startDate: "2025-01-01T00:00:00.000Z",
    endDate: "2030-01-01T00:00:00.000Z",
    ...overrides,
  }
}

async function createProviderViaApi(overrides = {}) {
  const res = await adminApi.post(`${BASE}/insurance-providers`).send(providerPayload(overrides))
  expect(res.status).toBe(201)
  return res.body.insuranceProvider
}

// ---------------------------------------------------------------------------
// GET /hostel/list — registered BEFORE the Admin role gate, so any
// authenticated user may call it (see route comment in admin.routes.js).
// ---------------------------------------------------------------------------

describe("GET /admin/hostel/list", () => {
  it("401 for unauthenticated requests", async () => {
    await assert401("get", `${BASE}/hostel/list`)
  })

  it("is reachable by non-admin users (documented behavior)", async () => {
    // SUSPECTED QUIRK (intentional per source comment): this route sits above
    // router.use(authorizeRoles(['Admin'])), so students get 200, not 403.
    const res = await studentApi.get(`${BASE}/hostel/list`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("returns active hostels as a minimal array and honors ?archive=true", async () => {
    const active = await createHostel({ name: "Misc List Hostel A" })
    const archived = await createHostel({ name: "Misc List Hostel B", isArchived: true })

    const res = await adminApi.get(`${BASE}/hostel/list`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)

    const names = res.body.map((h) => h.name)
    expect(names).toContain(active.name)
    expect(names).not.toContain(archived.name)

    const entry = res.body.find((h) => h.name === active.name)
    expect(entry._id).toBe(String(active._id))
    expect(entry.type).toBe(active.type)

    const archivedRes = await adminApi.get(`${BASE}/hostel/list?archive=true`)
    expect(archivedRes.status).toBe(200)
    const archivedNames = archivedRes.body.map((h) => h.name)
    expect(archivedNames).toContain(archived.name)
    expect(archivedNames).not.toContain(active.name)
  })
})

// ---------------------------------------------------------------------------
// GET /profile — Admin only, inline controller.
// ---------------------------------------------------------------------------

describe("GET /admin/profile", () => {
  it("401 for unauthenticated requests", async () => {
    await assert401("get", `${BASE}/profile`)
  })

  it("403 for non-admin roles", async () => {
    await assert403("get", `${BASE}/profile`)
  })

  it("returns the caller's session profile (standard envelope)", async () => {
    const res = await adminApi.get(`${BASE}/profile`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.profile._id).toBe(String(admin._id))
    expect(res.body.data.profile.email).toBe(admin.email.toLowerCase())
    expect(res.body.data.profile.role).toBe("Admin")
  })
})

// ---------------------------------------------------------------------------
// Insurance providers CRUD
// ---------------------------------------------------------------------------

describe("/admin/insurance-providers CRUD", () => {
  it("401 + 403 gates on every route", async () => {
    const id = "507f1f77bcf86cd799439011"
    await assert401("get", `${BASE}/insurance-providers`)
    await assert403("get", `${BASE}/insurance-providers`)
    await assert401("post", `${BASE}/insurance-providers`, providerPayload())
    await assert403("post", `${BASE}/insurance-providers`, providerPayload())
    await assert401("put", `${BASE}/insurance-providers/${id}`, { phone: "123" })
    await assert403("put", `${BASE}/insurance-providers/${id}`, { phone: "123" })
    await assert401("delete", `${BASE}/insurance-providers/${id}`)
    await assert403("delete", `${BASE}/insurance-providers/${id}`)
  })

  it("POST returns 500 (not 4xx) when required fields are missing", async () => {
    // SUSPECTED BUG: the service catches the mongoose ValidationError from
    // InsuranceProvider.create() and maps every non-duplicate error to a 500
    // ("Failed to create Insurance provider"). Invalid payloads should be 400/422.
    const res = await adminApi.post(`${BASE}/insurance-providers`).send({})
    expect(res.status).toBe(500)
    expect(res.body.message).toMatch(/failed to create/i)
  })

  it("creates, lists, updates, then deletes a provider (state via follow-up GETs)", async () => {
    const payload = providerPayload()
    const created = await createProviderViaApi(payload)
    expect(created.name).toBe(payload.name)
    expect(created.email).toBe(payload.email)
    expect(created.phone).toBe(payload.phone)
    expect(created.address).toBe(payload.address)
    expect(created.startDate).toBe("2025-01-01T00:00:00.000Z")
    expect(created.endDate).toBe("2030-01-01T00:00:00.000Z")

    // visible in the list
    const listRes = await adminApi.get(`${BASE}/insurance-providers`)
    expect(listRes.status).toBe(200)
    // observed envelope: { insuranceProviders: [...] } (controller sends result.data)
    expect(Array.isArray(listRes.body.insuranceProviders)).toBe(true)
    const listed = listRes.body.insuranceProviders.find((p) => String(p._id) === String(created._id))
    expect(listed).toBeTruthy()
    expect(listed.name).toBe(payload.name)

    // update phone + address, verify through a fresh list read
    const newPhone = "9000000001"
    const updRes = await adminApi.put(`${BASE}/insurance-providers/${created._id}`).send({
      phone: newPhone,
      address: "99 Updated Avenue",
    })
    expect(updRes.status).toBe(200)
    // observed envelope: { insuranceProvider } — no message key
    expect(updRes.body.insuranceProvider.phone).toBe(newPhone)
    expect(updRes.body.insuranceProvider.address).toBe("99 Updated Avenue")
    // unchanged fields survive a partial update
    expect(updRes.body.insuranceProvider.name).toBe(payload.name)

    const afterUpd = await adminApi.get(`${BASE}/insurance-providers`)
    const reread = afterUpd.body.insuranceProviders.find((p) => String(p._id) === String(created._id))
    expect(reread.phone).toBe(newPhone)

    // delete, then confirm it disappears; second delete is 404
    const delRes = await adminApi.delete(`${BASE}/insurance-providers/${created._id}`)
    expect(delRes.status).toBe(200)
    // observed: the delete envelope is an EMPTY OBJECT ({}) — the service's
    // "Insurance provider deleted" message is swallowed by the legacy
    // ServiceResponse object-style handling and never reaches the client
    expect(delRes.body).toEqual({})

    const afterDel = await adminApi.get(`${BASE}/insurance-providers`)
    expect(afterDel.body.insuranceProviders.some((p) => String(p._id) === String(created._id))).toBe(false)

    const delAgain = await adminApi.delete(`${BASE}/insurance-providers/${created._id}`)
    expect(delAgain.status).toBe(404)
    expect(delAgain.body.message).toMatch(/not found/i)
  })

  it("PUT with an unknown id returns 404", async () => {
    const res = await adminApi
      .put(`${BASE}/insurance-providers/507f1f77bcf86cd799439011`)
      .send({ phone: "1111111111" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/not found/i)
  })

  it("PUT with a malformed id surfaces as 500 instead of 400", async () => {
    // SUSPECTED BUG: updateInsuranceProvider's catch-all maps the mongoose
    // CastError to a 500; the global handler would have returned 400
    // "Invalid ID format". Current behavior documented here.
    const res = await adminApi.put(`${BASE}/insurance-providers/not-an-objectid`).send({})
    expect(res.status).toBe(500)
    expect(res.body.message).toMatch(/failed to update/i)
  })
})

// ---------------------------------------------------------------------------
// POST /insurance-providers/bulk-student-update
// ---------------------------------------------------------------------------

describe("POST /admin/insurance-providers/bulk-student-update", () => {
  let rollA
  let rollB
  let userA
  let userB

  beforeAll(async () => {
    userA = await seed.student()
    userB = await seed.student()
    rollA = (await createStudentProfile({ userId: userA._id })).rollNumber
    rollB = (await createStudentProfile({ userId: userB._id })).rollNumber
  })

  it("401 for unauthenticated requests", async () => {
    await assert401("post", `${BASE}/insurance-providers/bulk-student-update`, {
      insuranceProviderId: "x",
      studentsData: [],
    })
  })

  it("403 for non-admin roles", async () => {
    await assert403("post", `${BASE}/insurance-providers/bulk-student-update`, {
      insuranceProviderId: "x",
      studentsData: [],
    })
  })

  it("400 when insuranceProviderId is missing", async () => {
    const res = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({ studentsData: [{ rollNumber: rollA, insuranceNumber: "N1" }] })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/insurance provider id is required/i)
  })

  it("400 when studentsData is missing or empty", async () => {
    const noArray = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({ insuranceProviderId: "507f1f77bcf86cd799439011" })
    expect(noArray.status).toBe(400)
    expect(noArray.body.message).toMatch(/students data array is required/i)

    const empty = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({ insuranceProviderId: "507f1f77bcf86cd799439011", studentsData: [] })
    expect(empty.status).toBe(400)
    expect(empty.body.message).toMatch(/students data array is required/i)
  })

  it("404 when the provider does not exist", async () => {
    const res = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({
        insuranceProviderId: "507f1f77bcf86cd799439011",
        studentsData: [{ rollNumber: rollA, insuranceNumber: "N1" }],
      })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/insurance provider not found/i)
  })

  it("404 when no roll numbers match any student profile", async () => {
    const provider = await createProviderViaApi()
    const res = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({
        insuranceProviderId: provider._id,
        studentsData: [{ rollNumber: "NOPE404", insuranceNumber: "N1" }],
      })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no students found/i)
  })

  it("assigns insurance to matched students and reports unmatched rolls", async () => {
    const provider = await createProviderViaApi()

    const res = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({
        insuranceProviderId: provider._id,
        studentsData: [
          { rollNumber: rollA.toLowerCase(), insuranceNumber: "POL-001" }, // case-insensitive match
          { rollNumber: rollB, insuranceNumber: "POL-002" },
          { rollNumber: "GHOST42", insuranceNumber: "POL-003" },
        ],
      })
    expect(res.status).toBe(200)
    // observed envelope: { results, successDetails } — no message key
    expect(res.body.results.totalProcessed).toBe(3)
    expect(res.body.results.successfulUpdates).toBe(2)
    expect(res.body.results.notFoundCount).toBe(1)
    expect(res.body.results.notFound).toEqual(["GHOST42"])
    expect(res.body.results.failedCount).toBe(0)
    expect(res.body.successDetails.map((s) => s.rollNumber).sort()).toEqual([rollA, rollB].sort())

    // state verified through the health API (records were created lazily)
    const healthA = await adminApi.get(`${BASE}/student/health/${userA._id}`)
    expect(healthA.status).toBe(200)
    expect(healthA.body.health.insurance.insuranceNumber).toBe("POL-001")
    expect(healthA.body.health.insurance.insuranceProvider.name).toBe(provider.name)

    const healthB = await adminApi.get(`${BASE}/student/health/${userB._id}`)
    expect(healthB.body.health.insurance.insuranceNumber).toBe("POL-002")
  })

  it("clears insurance when insuranceNumber is blank", async () => {
    const provider = await createProviderViaApi()
    const res = await adminApi
      .post(`${BASE}/insurance-providers/bulk-student-update`)
      .send({
        insuranceProviderId: provider._id,
        studentsData: [{ rollNumber: rollA, insuranceNumber: "   " }],
      })
    expect(res.status).toBe(200)
    const detail = res.body.successDetails[0]
    expect(detail.insuranceNumber).toBeNull()
    expect(detail.note).toMatch(/set to null/i)

    const healthA = await adminApi.get(`${BASE}/student/health/${userA._id}`)
    expect(healthA.body.health.insurance.insuranceNumber).toBeNull()
    expect(healthA.body.health.insurance.insuranceProvider).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Student health GET/PUT
// ---------------------------------------------------------------------------

describe("/admin/student/health/:userId", () => {
  let healthUser

  beforeAll(async () => {
    healthUser = await seed.student()
  })

  it("401 + 403 gates", async () => {
    await assert401("get", `${BASE}/student/health/${student._id}`)
    await assert403("get", `${BASE}/student/health/${student._id}`)
    await assert401("put", `${BASE}/student/health/${student._id}`, { bloodGroup: "O+" })
    await assert403("put", `${BASE}/student/health/${student._id}`, { bloodGroup: "O+" })
  })

  it("GET creates-and-returns a record (201) for a user without one, then fetches it (200)", async () => {
    const first = await adminApi.get(`${BASE}/student/health/${healthUser._id}`)
    expect(first.status).toBe(201)
    // observed envelope: { health } — the service's message is stripped by the controller
    expect(first.body.health.userId).toBe(String(healthUser._id))
    expect(first.body.health.bloodGroup).toBe("")
    // observed: a lazily created record has NO insurance key at all in the
    // JSON (the empty subdoc's undefined fields are dropped by toJSON)
    expect(first.body.health.insurance).toBeUndefined()

    const second = await adminApi.get(`${BASE}/student/health/${healthUser._id}`)
    expect(second.status).toBe(200)
    expect(second.body.health._id).toBe(first.body.health._id)
  })

  it("GET with a malformed userId returns 400 Invalid ID format", async () => {
    const res = await adminApi.get(`${BASE}/student/health/nope`)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/invalid id format/i)
  })

  it("PUT persists bloodGroup and insurance, verified via GET", async () => {
    const provider = await createProviderViaApi()
    const put = await adminApi.put(`${BASE}/student/health/${healthUser._id}`).send({
      bloodGroup: "B+",
      insurance: { insuranceProvider: provider._id, insuranceNumber: "HL-7788" },
    })
    expect(put.status).toBe(200)
    // observed envelope: { health } — no message key
    expect(put.body.health.bloodGroup).toBe("B+")
    expect(put.body.health.insurance.insuranceNumber).toBe("HL-7788")
    // observed: the PUT read path does NOT populate insuranceProvider — raw id
    expect(String(put.body.health.insurance.insuranceProvider)).toBe(String(provider._id))

    // the GET read path populates the provider
    const get = await adminApi.get(`${BASE}/student/health/${healthUser._id}`)
    expect(get.body.health.bloodGroup).toBe("B+")
    expect(get.body.health.insurance.insuranceNumber).toBe("HL-7788")
    expect(get.body.health.insurance.insuranceProvider.name).toBe(provider.name)
  })

  it("PUT for a user without a health record silently reports success with null", async () => {
    // SUSPECTED BUG: updateHealthByUser has no upsert and the service never
    // checks for null, so a missing record yields 200 "Health updated" with
    // health: null instead of a 404 (and nothing is persisted).
    const ghost = await seed.student()
    const res = await adminApi.put(`${BASE}/student/health/${ghost._id}`).send({ bloodGroup: "AB-" })
    expect(res.status).toBe(200)
    expect(res.body.health).toBeNull()

    // and a later GET still lazy-creates an empty record
    const get = await adminApi.get(`${BASE}/student/health/${ghost._id}`)
    expect(get.body.health.bloodGroup).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Insurance claims CRUD
// ---------------------------------------------------------------------------

describe("/admin/insurance-claims CRUD", () => {
  let claimUser
  let provider

  beforeAll(async () => {
    claimUser = await seed.student()
    provider = await createProviderViaApi()
  })

  const claimPayload = (overrides = {}) => ({
    userId: claimUser._id,
    insuranceProvider: provider._id,
    amount: 15000,
    hospitalName: "Test General Hospital",
    description: "Dengue treatment",
    ...overrides,
  })

  it("401 + 403 gates on every route", async () => {
    const id = "507f1f77bcf86cd799439011"
    await assert401("post", `${BASE}/insurance-claims`, {})
    await assert403("post", `${BASE}/insurance-claims`, {})
    await assert401("get", `${BASE}/insurance-claims/${student._id}`)
    await assert403("get", `${BASE}/insurance-claims/${student._id}`)
    await assert401("put", `${BASE}/insurance-claims/${id}`, { amount: 1 })
    await assert403("put", `${BASE}/insurance-claims/${id}`, { amount: 1 })
    await assert401("delete", `${BASE}/insurance-claims/${id}`)
    await assert403("delete", `${BASE}/insurance-claims/${id}`)
  })

  it("POST returns 422 when required fields are missing", async () => {
    const res = await adminApi.post(`${BASE}/insurance-claims`).send({ amount: 100 })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/validation failed/i)
    const fields = res.body.errors.map((e) => e.field)
    expect(fields).toContain("userId")
    expect(fields).toContain("insuranceProvider")
  })

  it("creates, lists by user, updates, then deletes a claim", async () => {
    const payload = claimPayload()
    const created = await adminApi.post(`${BASE}/insurance-claims`).send(payload)
    expect(created.status).toBe(201)
    // observed envelope: { insuranceClaim } — no message key
    expect(created.body.insuranceClaim.amount).toBe(15000)
    expect(created.body.insuranceClaim.hospitalName).toBe("Test General Hospital")
    expect(created.body.insuranceClaim.userId).toBe(String(claimUser._id))

    // listed under the owner's userId
    const list = await adminApi.get(`${BASE}/insurance-claims/${claimUser._id}`)
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.insuranceClaims)).toBe(true)
    const stored = list.body.insuranceClaims.find(
      (c) => String(c._id) === String(created.body.insuranceClaim._id),
    )
    expect(stored).toBeTruthy()
    expect(stored.description).toBe("Dengue treatment")
    // observed: claims list is a bare find — insuranceProvider is NOT populated
    expect(String(stored.insuranceProvider)).toBe(String(provider._id))

    // empty list for a user without claims
    const stranger = await seed.student()
    const emptyList = await adminApi.get(`${BASE}/insurance-claims/${stranger._id}`)
    expect(emptyList.status).toBe(200)
    expect(emptyList.body.insuranceClaims).toEqual([])

    // update amount + status-free fields; verify through the list endpoint
    const upd = await adminApi
      .put(`${BASE}/insurance-claims/${created.body.insuranceClaim._id}`)
      .send({ amount: 22000, hospitalName: "Updated Hospital" })
    expect(upd.status).toBe(200)
    expect(upd.body.insuranceClaim.amount).toBe(22000)
    expect(upd.body.insuranceClaim.hospitalName).toBe("Updated Hospital")

    const relist = await adminApi.get(`${BASE}/insurance-claims/${claimUser._id}`)
    const restored = relist.body.insuranceClaims.find(
      (c) => String(c._id) === String(created.body.insuranceClaim._id),
    )
    expect(restored.amount).toBe(22000)

    // delete removes it; a fresh list no longer contains it
    const del = await adminApi.delete(`${BASE}/insurance-claims/${created.body.insuranceClaim._id}`)
    expect(del.status).toBe(200)
    expect(del.body.message).toMatch(/deleted/i)

    const finalList = await adminApi.get(`${BASE}/insurance-claims/${claimUser._id}`)
    expect(finalList.body.insuranceClaims).toEqual([])
  })

  it("PUT with an unknown id reports success with a null claim", async () => {
    // SUSPECTED BUG: updateClaimById returns null for a missing id but the
    // service/controller never check it — 200 "Insurance claim updated"
    // with insuranceClaim: null instead of 404.
    const res = await adminApi
      .put(`${BASE}/insurance-claims/507f1f77bcf86cd799439011`)
      .send({ amount: 5 })
    expect(res.status).toBe(200)
    expect(res.body.insuranceClaim).toBeNull()
  })

  it("DELETE is idempotent and never 404s", async () => {
    // SUSPECTED BUG: deleteClaimById ignores its result, so deleting an
    // already-deleted / nonexistent claim returns the same 200 message.
    const res = await adminApi.delete(`${BASE}/insurance-claims/507f1f77bcf86cd799439011`)
    expect(res.status).toBe(200)
    expect(res.body.message).toMatch(/deleted/i)
  })

  it("malformed ids return 400 Invalid ID format", async () => {
    const badGet = await adminApi.get(`${BASE}/insurance-claims/nope`)
    expect(badGet.status).toBe(400)

    const badPut = await adminApi.put(`${BASE}/insurance-claims/nope`).send({ amount: 1 })
    expect(badPut.status).toBe(400)

    const badDelete = await adminApi.delete(`${BASE}/insurance-claims/nope`)
    expect(badDelete.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// POST /user/update-password
// ---------------------------------------------------------------------------

describe("POST /admin/user/update-password", () => {
  let target

  beforeAll(async () => {
    target = await seed.student({ name: "Password Target" })
  })

  it("401 for unauthenticated requests", async () => {
    await assert401("post", `${BASE}/user/update-password`, { email: target.email })
  })

  it("403 for non-admin roles", async () => {
    await assert403("post", `${BASE}/user/update-password`, { email: target.email })
  })

  it("400 when email or newPassword are missing/blank", async () => {
    const noEmail = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ newPassword: "secret123" })
    expect(noEmail.status).toBe(400)
    expect(noEmail.body.message).toMatch(/email is required/i)

    const noPassword = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ email: target.email })
    expect(noPassword.status).toBe(400)
    expect(noPassword.body.message).toMatch(/password is required/i)

    const blankPassword = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ email: target.email, newPassword: "   " })
    expect(blankPassword.status).toBe(400)
  })

  it("400 when the password is shorter than 6 characters", async () => {
    const res = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ email: target.email, newPassword: "abc" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/at least 6 characters/i)
  })

  it("404 when no user matches the email", async () => {
    const res = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ email: "ghost-user@nowhere.test", newPassword: "secret123" })
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/user not found/i)
  })

  it("updates the password (case-insensitive email match), verified against the hash", async () => {
    // No API exists to verify a password locally (auth lives in the Go
    // backend), so persistence is checked against the stored bcrypt hash.
    const res = await adminApi
      .post(`${BASE}/user/update-password`)
      .send({ email: target.email.toUpperCase(), newPassword: "brand-new-pw" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toMatch(/password updated successfully/i)

    const { default: User } = await import("../../../src/models/user/User.model.js")
    const reloaded = await User.findById(target._id)
    expect(reloaded.password).not.toBe(target.password)
    expect(await bcrypt.compare("brand-new-pw", reloaded.password)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GET /task-stats
// ---------------------------------------------------------------------------

describe("GET /admin/task-stats", () => {
  it("401 for unauthenticated requests", async () => {
    await assert401("get", `${BASE}/task-stats`)
  })

  it("403 for non-admin roles", async () => {
    await assert403("get", `${BASE}/task-stats`)
  })

  it("aggregates exact status/category/priority counts and overdue tasks", async () => {
    const future = new Date(Date.now() + 7 * 86400000)
    const past = new Date(Date.now() - 2 * 86400000)

    await createTask({ createdBy: admin._id, status: "Created", category: "Maintenance", priority: "High", dueDate: future })
    await createTask({ createdBy: admin._id, status: "Completed", category: "Security", priority: "Low", dueDate: past })
    await createTask({ createdBy: admin._id, status: "In Progress", category: "Other", priority: "Medium", dueDate: past })

    const res = await adminApi.get(`${BASE}/task-stats`)
    expect(res.status).toBe(200)
    // observed envelope: controller sends result.data directly (no wrapper)
    expect(res.body.statusCounts).toEqual({ Created: 1, "In Progress": 1, Completed: 1 })
    expect(res.body.categoryCounts).toEqual({ Maintenance: 1, Security: 1, Other: 1 })
    expect(res.body.priorityCounts).toEqual({ High: 1, Medium: 1, Low: 1 })
    // overdue = dueDate < now AND status != Completed
    expect(res.body.overdueTasks).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Hardening additions
// ---------------------------------------------------------------------------

describe("insurance provider name uniqueness", () => {
  // SUSPECTED BUG (missing constraint): InsuranceProvider.name has a plain
  // (non-unique) index and the service never checks duplicates, so identical
  // names — even exact matches — are silently accepted. Any UI keyed on the
  // provider NAME will be ambiguous afterwards.
  it("duplicate names are accepted, even case-identical ones (documents current behavior)", async () => {
    const sharedName = `Dup Name Provider ${Math.random().toString(36).slice(2, 8)}`

    const first = await createProviderViaApi({ name: sharedName })
    const second = await createProviderViaApi({ name: sharedName.toLowerCase() })

    expect(String(second._id)).not.toBe(String(first._id))

    const list = await adminApi.get(`${BASE}/insurance-providers`)
    const matches = list.body.insuranceProviders.filter(
      (p) => p.name.toLowerCase() === sharedName.toLowerCase(),
    )
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})

describe("insurance claims — update after delete", () => {
  let claimUser2

  beforeAll(async () => {
    claimUser2 = await seed.student()
  })

  // Same failure family as the unknown-id PUT already documented above:
  // updateClaimById returns null post-delete but nothing checks it.
  it("updating an already-deleted claim reports success with a null claim (documents current behavior)", async () => {
    const provider = await createProviderViaApi()
    const created = await adminApi.post(`${BASE}/insurance-claims`).send({
      userId: claimUser2._id,
      insuranceProvider: provider._id,
      amount: 500,
      hospitalName: "Delete Then Update Hospital",
      description: "probe",
    })
    const claimId = created.body.insuranceClaim._id

    const del = await adminApi.delete(`${BASE}/insurance-claims/${claimId}`)
    expect(del.status).toBe(200)

    const res = await adminApi.put(`${BASE}/insurance-claims/${claimId}`).send({ amount: 999 })
    expect(res.status).toBe(200)
    // observed envelope: controller sends result.data -> { insuranceClaim } —
    // the service's "Insurance claim updated" message is stripped
    expect(res.body.insuranceClaim).toBeNull()

    // and the deleted claim stays gone from the owner's list
    const list = await adminApi.get(`${BASE}/insurance-claims/${claimUser2._id}`)
    expect(list.body.insuranceClaims).toEqual([])
  })
})

describe("student health PUT double-write", () => {
  it("two consecutive PUTs overwrite each other and GET reflects only the last write", async () => {
    const user = await seed.student()
    const providerA = await createProviderViaApi()
    const providerB = await createProviderViaApi()

    // ensure the record exists via the lazy-create GET so both writes hit the
    // update branch (not create-on-write)
    await adminApi.get(`${BASE}/student/health/${user._id}`)

    const putA = await adminApi.put(`${BASE}/student/health/${user._id}`).send({
      bloodGroup: "O+",
      insurance: { insuranceProvider: providerA._id, insuranceNumber: "DW-0001" },
    })
    expect(putA.status).toBe(200)

    const putB = await adminApi.put(`${BASE}/student/health/${user._id}`).send({
      bloodGroup: "AB+",
      insurance: { insuranceProvider: providerB._id, insuranceNumber: "DW-0002" },
    })
    expect(putB.status).toBe(200)
    expect(putB.body.health.bloodGroup).toBe("AB+")

    const get = await adminApi.get(`${BASE}/student/health/${user._id}`)
    expect(get.body.health.bloodGroup).toBe("AB+")
    expect(get.body.health.insurance.insuranceNumber).toBe("DW-0002")
    expect(String(get.body.health.insurance.insuranceProvider._id)).toBe(String(providerB._id))
  })
})

describe("GET /admin/task-stats — zero/delta semantics", () => {
  it("returns empty count objects when nothing has changed the aggregates' shape", async () => {
    // Shape probe (counts may include tasks seeded by earlier describes in this
    // file): every aggregate key must exist even if a bucket is empty.
    const res = await adminApi.get(`${BASE}/task-stats`)
    expect(res.status).toBe(200)
    expect(typeof res.body.statusCounts).toBe("object")
    expect(typeof res.body.categoryCounts).toBe("object")
    expect(typeof res.body.priorityCounts).toBe("object")
    expect(typeof res.body.overdueTasks).toBe("number")
  })

  it("a completed-but-overdue task does not raise overdueTasks (delta check)", async () => {
    const before = await adminApi.get(`${BASE}/task-stats`)
    const completedBefore = before.body.statusCounts.Completed ?? 0
    const overdueBefore = before.body.overdueTasks

    const past = new Date(Date.now() - 3 * 86400000)
    await createTask({ createdBy: admin._id, status: "Completed", category: "Housekeeping", priority: "Low", dueDate: past })

    const after = await adminApi.get(`${BASE}/task-stats`)
    expect(after.body.statusCounts.Completed).toBe(completedBefore + 1)
    // overdue counts only non-completed past-due tasks
    expect(after.body.overdueTasks).toBe(overdueBefore)
  })
})

describe("POST /admin/student/health/bulk-update", () => {
  let rollH1
  let rollH2
  let userH1
  let userH2

  beforeAll(async () => {
    userH1 = await seed.student()
    userH2 = await seed.student()
    rollH1 = (await createStudentProfile({ userId: userH1._id })).rollNumber
    rollH2 = (await createStudentProfile({ userId: userH2._id })).rollNumber
  })

  const url = `${BASE}/student/health/bulk-update`
  const payloadFor = (rows) => ({ studentsData: rows })

  it("401 for unauthenticated requests", async () => {
    await assert401("post", url, payloadFor([{ rollNumber: rollH1, bloodGroup: "A+" }]))
  })

  it("403 for students and wardens", async () => {
    await assert403("post", url, payloadFor([{ rollNumber: rollH1, bloodGroup: "A+" }]))

    const wardenApi = await as(await seed.warden())
    const res = await wardenApi.post(url).send(payloadFor([{ rollNumber: rollH1, bloodGroup: "A+" }]))
    expect(res.status).toBe(403)
  })

  it("400 when studentsData is missing or empty", async () => {
    const missing = await adminApi.post(url).send({})
    expect(missing.status).toBe(400)
    expect(missing.body.message).toMatch(/students data array is required/i)

    const empty = await adminApi.post(url).send(payloadFor([]))
    expect(empty.status).toBe(400)
  })

  it("404 when no roll numbers match any profile", async () => {
    const res = await adminApi.post(url).send(payloadFor([{ rollNumber: "NOPE777", bloodGroup: "O-" }]))
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no students found/i)
    // NOTE: error body carries only { message } — no success flag.
  })

  it("updates matched students and lists unmatched rolls (mixed rows)", async () => {
    const res = await adminApi.post(url).send(
      payloadFor([
        { rollNumber: rollH1.toLowerCase(), bloodGroup: "B+" }, // case-insensitive match
        { rollNumber: rollH2, bloodGroup: "" },
        { rollNumber: "GHOSTHB", bloodGroup: "A+" },
      ]),
    )
    expect(res.status).toBe(200)
    // observed envelope: controller sends result.data directly — the service's
    // "Bulk health update completed" message is stripped, body is
    // { results, successDetails }
    expect(res.body.results.totalProcessed).toBe(3)
    expect(res.body.results.successfulUpdates).toBe(2)
    expect(res.body.results.notFoundCount).toBe(1)
    expect(res.body.results.notFound).toEqual(["GHOSTHB"])

    const healthH1 = await adminApi.get(`${BASE}/student/health/${userH1._id}`)
    expect(healthH1.body.health.bloodGroup).toBe("B+")

    // blank bloodGroup still creates/keeps the record, stored as ''
    const healthH2 = await adminApi.get(`${BASE}/student/health/${userH2._id}`)
    expect(healthH2.body.health.bloodGroup).toBe("")
  })

  it("Hostel Supervisors pass the route gate but fail CLOSED without an active hostel", async () => {
    // The bulk tool is registered above the Admin-only gate specifically so
    // Hostel Supervisors can use it. But the scope helper fails closed: a
    // hostel-bound session whose userData.hostel is null matches no students,
    // surfacing as the service's 404 rather than a scope error.
    const supervisor = await seed.hostelSupervisor()
    const supervisorApi = await as(supervisor) // session hostel: null

    const res = await supervisorApi.post(url).send(payloadFor([{ rollNumber: rollH1, bloodGroup: "A-" }]))
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/no students found/i)
  })

  it("is reachable by a scoped Hostel Supervisor for students in their active hostel", async () => {
    const hostel = await createHostel({ name: "Bulk Health HS Hostel" })
    const unit = await createUnit({ hostelId: hostel._id })
    const room = await createRoom({ hostelId: hostel._id, unitId: unit._id })

    const student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id })
    await createAllocation({
      userId: student._id,
      studentProfileId: profile._id,
      hostelId: hostel._id,
      roomId: room._id,
    })

    const supervisor = await seed.hostelSupervisor()
    const supervisorApi = await as(supervisor, {
      userData: { hostel: { _id: String(hostel._id), name: hostel.name, type: hostel.type } },
    })

    const res = await supervisorApi
      .post(url)
      .send(payloadFor([{ rollNumber: profile.rollNumber, bloodGroup: "AB-" }]))
    expect(res.status).toBe(200)
    expect(res.body.results.successfulUpdates).toBe(1)
    expect(res.body.results.notFound).toEqual([])

    const health = await adminApi.get(`${BASE}/student/health/${student._id}`)
    expect(health.body.health.bloodGroup).toBe("AB-")
  })
})
