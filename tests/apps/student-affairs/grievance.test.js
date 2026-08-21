import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

/**
 * Integration tests for /api/v1/student-affairs/grievances.
 *
 * The grievance module is an unfinished stub, and its wiring is broken in two
 * ways that these tests DOCUMENT (see SUSPECTED BUG notes):
 *
 * 1. The router has NO `authenticate` middleware, so `req.user` is never
 *    populated. Every role-gated endpoint therefore answers 401
 *    ("Authentication required") even for callers carrying a valid session,
 *    and the role gates can never produce a 403.
 * 2. `grievanceService.getGrievances` passes its message as the statusCode
 *    argument of `success()` (`success(data, 'msg')`), so GET / answers 500.
 *
 * Controllers use sendRawResponse: failure -> { message }; validation
 * failures -> 422 via the global error handler.
 */

const BASE = "/api/v1/student-affairs/grievances"
const VALID_ID = "507f1f77bcf86cd799439011"

describe("student-affairs /grievances", () => {
  let admin
  let superAdminUser
  let studentUser
  let wardenUser

  beforeAll(async () => {
    await setupTestDb()
    admin = await seed.admin()
    superAdminUser = await seed.superAdmin()
    studentUser = await seed.student()
    wardenUser = await seed.warden()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST / (create)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("POST /", () => {
    const validPayload = {
      title: "Hostel water shortage",
      description: "There has been no water supply in block C for two days.",
      category: "hostel",
      priority: "high",
    }

    it("401 for unauthenticated create", async () => {
      const api = await anon()
      const res = await api.post(BASE).send(validPayload)
      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
      expect(res.body.message).toBe("Authentication required")
    })

    // SUSPECTED BUG: even authenticated callers get 401 because the router
    // never mounts `authenticate`, so req.user stays undefined and the
    // Student-only role gate rejects everyone. A 403-for-wrong-role or a
    // successful create is unreachable today.
    it("401 even for authenticated users (missing authenticate middleware)", async () => {
      const apiAdmin = await as(admin)
      const adminRes = await apiAdmin.post(BASE).send(validPayload)
      expect(adminRes.status).toBe(401)

      const apiStudent = await as(studentUser)
      const studentRes = await apiStudent.post(BASE).send(validPayload)
      expect(studentRes.status).toBe(401)
    })

    // The authorize('Student') gate runs BEFORE body validation, and because
    // req.user is never populated every caller — valid payload or not — gets
    // 401. Schema rejections are therefore unreachable on this route today.
    it("401 even before validation can reject bad payloads", async () => {
      const api = await anon()

      const missing = await api.post(BASE).send({})
      expect(missing.status).toBe(401)

      const badCategory = await api.post(BASE).send({ ...validPayload, category: "universe" })
      expect(badCategory.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET / (list)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /", () => {
    // SUSPECTED BUG: grievanceService.getGrievances calls
    // `success({ grievances, pagination }, 'Grievance model not implemented yet')`
    // — the message lands in the statusCode slot, so sendRawResponse calls
    // res.status("<string>") and the request blows up with a 500.
    it("500 due to success() statusCode misuse (stub bug)", async () => {
      const api = await anon()
      const res = await api.get(BASE)
      expect(res.status).toBe(500)
    })

    it("500 also for authenticated callers", async () => {
      const api = await as(admin)
      const res = await api.get(BASE)
      expect(res.status).toBe(500)
    })

    it("422 for invalid query filters (validation runs before the service)", async () => {
      const api = await anon()

      const badStatus = await api.get(BASE).query({ status: "not-a-status" })
      expect(badStatus.status).toBe(422)

      const badCategory = await api.get(BASE).query({ category: "space" })
      expect(badCategory.status).toBe(422)

      const badAssignee = await api.get(BASE).query({ assignedTo: "abc" })
      expect(badAssignee.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /stats — Admin-level gate (unreachable: always 401, see module note)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /stats", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.get(`${BASE}/stats`)
      expect(res.status).toBe(401)
    })

    // SUSPECTED BUG: same missing-authenticate issue — Admin/Super Admin also
    // receive 401 instead of the zeroed stats payload.
    it("401 even for Admin and Super Admin (req.user never populated)", async () => {
      const apiAdmin = await as(admin)
      expect((await apiAdmin.get(`${BASE}/stats`)).status).toBe(401)

      const apiSuper = await as(superAdminUser)
      expect((await apiSuper.get(`${BASE}/stats`)).status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /:id and DELETE /:id — no gates at all; stub answers 404
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /:id & DELETE /:id", () => {
    it("422 for malformed id", async () => {
      const api = await anon()
      const res = await api.get(`${BASE}/not-an-id`)
      expect(res.status).toBe(422)
      expect(res.body.errors[0].field).toBe("id")
    })

    it("404 from the stub for a well-formed id (anonymous allowed)", async () => {
      const api = await anon()
      const res = await api.get(`${BASE}/${VALID_ID}`)
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)
    })

    it("DELETE is not role-gated; stub returns 404 for valid id", async () => {
      const api = await anon()
      const res = await api.delete(`${BASE}/${VALID_ID}`)
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)

      const badId = await api.delete(`${BASE}/xyz`)
      expect(badId.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/status — gated (and thus always 401 today)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/status", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.patch(`${BASE}/${VALID_ID}/status`).send({ status: "pending" })
      expect(res.status).toBe(401)
    })

    it("401 for every authenticated role (broken identity plumbing)", async () => {
      const apiStudent = await as(studentUser)
      expect(
        (
          await apiStudent.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" })
        ).status
      ).toBe(401)

      const apiWarden = await as(wardenUser)
      expect(
        (
          await apiWarden.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" })
        ).status
      ).toBe(401)

      const apiAdmin = await as(admin)
      expect(
        (await apiAdmin.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" }))
          .status
      ).toBe(401)
    })

    // The handler gate runs before body validation, so bad payloads also get
    // 401 (not 422) while req.user is never populated.
    it("401 for invalid status payloads too (gate precedes validation)", async () => {
      const api = await anon()
      const badValue = await api.patch(`${BASE}/${VALID_ID}/status`).send({ status: "finished" })
      expect(badValue.status).toBe(401)

      const missing = await api.patch(`${BASE}/${VALID_ID}/status`).send({ notes: "no status" })
      expect(missing.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/assign — Admin-level gate (always 401 today)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/assign", () => {
    it("401 unauthenticated and authenticated alike", async () => {
      const apiAnon = await anon()
      expect(
        (await apiAnon.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })).status
      ).toBe(401)

      const apiWarden = await as(wardenUser)
      expect(
        (await apiWarden.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })).status
      ).toBe(401)

      const apiAdmin = await as(admin)
      expect(
        (await apiAdmin.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })).status
      ).toBe(401)
    })

    it("401 for invalid assignee payloads too (gate precedes validation)", async () => {
      const api = await anon()
      const missing = await api.patch(`${BASE}/${VALID_ID}/assign`).send({})
      expect(missing.status).toBe(401)

      const invalid = await api.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: "nope" })
      expect(invalid.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/resolve — handlers-only gate (always 401 today)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/resolve", () => {
    it("401 unauthenticated and authenticated alike", async () => {
      const apiAnon = await anon()
      const anonRes = await apiAnon
        .patch(`${BASE}/${VALID_ID}/resolve`)
        .send({ resolution: "Fixed the water pump yesterday morning" })
      expect(anonRes.status).toBe(401)

      const apiAdmin = await as(admin)
      const adminRes = await apiAdmin
        .patch(`${BASE}/${VALID_ID}/resolve`)
        .send({ resolution: "Replaced the motor; supply restored" })
      expect(adminRes.status).toBe(401)
    })

    it("401 for short resolution too (gate precedes validation)", async () => {
      const api = await anon()
      const res = await api.patch(`${BASE}/${VALID_ID}/resolve`).send({ resolution: "fixed" })
      expect(res.status).toBe(401)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /:id/comments — no role gate at all
  // ═══════════════════════════════════════════════════════════════════════════
  describe("POST /:id/comments", () => {
    // SUSPECTED BUG: the comments route has neither authenticate nor any role
    // gate, so anonymous callers pass validation and reach the (stubbed)
    // service. Documented to match current behavior.
    it("reaches the service even without authentication", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/${VALID_ID}/comments`).send({ content: "anon ping" })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)
    })

    it("422 for empty content", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/${VALID_ID}/comments`).send({ content: "" })
      expect(res.status).toBe(422)
    })

    it("404 from the stub for valid content", async () => {
      const api = await anon()
      const res = await api
        .post(`${BASE}/${VALID_ID}/comments`)
        .send({ content: "Any update on this?", isInternal: false })
      expect(res.status).toBe(404)
    })
  })
})
