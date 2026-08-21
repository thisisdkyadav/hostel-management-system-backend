import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

/**
 * Integration tests for /api/v1/student-affairs/grievances.
 *
 * The grievance module is an unfinished stub: persistence operations answer
 * 400/404 with "Grievance model not implemented yet", while GET / and
 * GET /stats return zeroed payloads. The router mounts `authenticate` for all
 * routes; role gates decide the rest. Controllers use sendRawResponse:
 * failure -> { message }; validation failures -> 422 via the global handler.
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
  // POST / (create) — Student-only
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

    it("403 for non-student roles (Admin, Warden)", async () => {
      const apiAdmin = await as(admin)
      expect((await apiAdmin.post(BASE).send(validPayload)).status).toBe(403)

      const apiWarden = await as(wardenUser)
      expect((await apiWarden.post(BASE).send(validPayload)).status).toBe(403)
    })

    it("reaches the stub for students: 400 'model not implemented yet'", async () => {
      const api = await as(studentUser)
      const res = await api.post(BASE).send(validPayload)
      expect(res.status).toBe(400)
      expect(res.body.message).toMatch(/not implemented yet/)
    })

    it("422 for invalid payloads (role gate passes, then validation)", async () => {
      const api = await as(studentUser)

      const missing = await api.post(BASE).send({})
      expect(missing.status).toBe(422)

      const badCategory = await api.post(BASE).send({ ...validPayload, category: "universe" })
      expect(badCategory.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET / (list) — any authenticated user; stub returns a zeroed page
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.get(BASE)
      expect(res.status).toBe(401)
    })

    it("200 with the empty stub payload (envelope intact)", async () => {
      const api = await as(admin)
      const res = await api.get(BASE)
      expect(res.status).toBe(200)
      // sendRawResponse emits the bare service data
      expect(res.body.grievances).toEqual([])
      expect(res.body.pagination).toEqual({})
    })

    it("422 for invalid query filters (validation runs before the service)", async () => {
      const api = await as(admin)

      const badStatus = await api.get(BASE).query({ status: "not-a-status" })
      expect(badStatus.status).toBe(422)

      const badCategory = await api.get(BASE).query({ category: "space" })
      expect(badCategory.status).toBe(422)

      const badAssignee = await api.get(BASE).query({ assignedTo: "abc" })
      expect(badAssignee.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /stats — Admin-level gate
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /stats", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.get(`${BASE}/stats`)
      expect(res.status).toBe(401)
    })

    it("403 for Student and Warden", async () => {
      const apiStudent = await as(studentUser)
      expect((await apiStudent.get(`${BASE}/stats`)).status).toBe(403)

      const apiWarden = await as(wardenUser)
      expect((await apiWarden.get(`${BASE}/stats`)).status).toBe(403)
    })

    it("200 with zeroed stats for Admin and Super Admin", async () => {
      const apiAdmin = await as(admin)
      const res = await apiAdmin.get(`${BASE}/stats`)
      expect(res.status).toBe(200)
      expect(res.body.total).toBe(0)

      const apiSuper = await as(superAdminUser)
      expect((await apiSuper.get(`${BASE}/stats`)).status).toBe(200)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // GET /:id and DELETE /:id — authenticated; stub answers 404
  // ═══════════════════════════════════════════════════════════════════════════
  describe("GET /:id & DELETE /:id", () => {
    it("401 unauthenticated; 422 for malformed id", async () => {
      const api = await anon()
      expect((await api.get(`${BASE}/not-an-id`)).status).toBe(401)

      const authed = await as(studentUser)
      const res = await authed.get(`${BASE}/not-an-id`)
      expect(res.status).toBe(422)
      expect(res.body.errors[0].field).toBe("id")
    })

    it("404 from the stub for a well-formed id", async () => {
      const api = await as(studentUser)
      const res = await api.get(`${BASE}/${VALID_ID}`)
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)
    })

    it("DELETE reaches the stub for any authenticated caller", async () => {
      const api = await as(studentUser)
      const res = await api.delete(`${BASE}/${VALID_ID}`)
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)

      const badId = await api.delete(`${BASE}/xyz`)
      expect(badId.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/status — handlers only (Admin/Super Admin/SA roles)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/status", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.patch(`${BASE}/${VALID_ID}/status`).send({ status: "pending" })
      expect(res.status).toBe(401)
    })

    it("403 for Student and Warden", async () => {
      const apiStudent = await as(studentUser)
      expect(
        (await apiStudent.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" })).status
      ).toBe(403)

      const apiWarden = await as(wardenUser)
      expect(
        (await apiWarden.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" })).status
      ).toBe(403)
    })

    it("reaches the stub for handlers: 404 after valid payload", async () => {
      const apiAdmin = await as(admin)
      const res = await apiAdmin.patch(`${BASE}/${VALID_ID}/status`).send({ status: "under_review" })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)
    })

    it("422 for invalid status payloads once past the gate", async () => {
      const api = await as(admin)
      const badValue = await api.patch(`${BASE}/${VALID_ID}/status`).send({ status: "finished" })
      expect(badValue.status).toBe(422)

      const missing = await api.patch(`${BASE}/${VALID_ID}/status`).send({ notes: "no status" })
      expect(missing.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/assign — Admin-level gate
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/assign", () => {
    it("401 unauthenticated; 403 for Warden", async () => {
      const apiAnon = await anon()
      expect(
        (await apiAnon.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })).status
      ).toBe(401)

      const apiWarden = await as(wardenUser)
      expect(
        (await apiWarden.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })).status
      ).toBe(403)
    })

    it("reaches the stub for Admin; 422 for invalid payloads", async () => {
      const apiAdmin = await as(admin)
      const ok = await apiAdmin.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: VALID_ID })
      expect(ok.status).toBe(404)

      const missing = await apiAdmin.patch(`${BASE}/${VALID_ID}/assign`).send({})
      expect(missing.status).toBe(422)

      const invalid = await apiAdmin.patch(`${BASE}/${VALID_ID}/assign`).send({ assigneeId: "nope" })
      expect(invalid.status).toBe(422)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH /:id/resolve — handlers-only gate
  // ═══════════════════════════════════════════════════════════════════════════
  describe("PATCH /:id/resolve", () => {
    it("401 unauthenticated; 403 for Student", async () => {
      const apiAnon = await anon()
      const anonRes = await apiAnon
        .patch(`${BASE}/${VALID_ID}/resolve`)
        .send({ resolution: "Fixed the water pump yesterday morning" })
      expect(anonRes.status).toBe(401)

      const apiStudent = await as(studentUser)
      expect(
        (
          await apiStudent
            .patch(`${BASE}/${VALID_ID}/resolve`)
            .send({ resolution: "Fixed the water pump yesterday morning" })
        ).status
      ).toBe(403)
    })

    it("reaches the stub for Admin; 422 for short resolution", async () => {
      const api = await as(admin)
      const short = await api.patch(`${BASE}/${VALID_ID}/resolve`).send({ resolution: "fixed" })
      expect(short.status).toBe(422)

      const ok = await api
        .patch(`${BASE}/${VALID_ID}/resolve`)
        .send({ resolution: "Replaced the motor; supply restored" })
      expect(ok.status).toBe(404)
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // POST /:id/comments — Student + grievance handlers
  // ═══════════════════════════════════════════════════════════════════════════
  describe("POST /:id/comments", () => {
    it("401 unauthenticated", async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/${VALID_ID}/comments`).send({ content: "anon ping" })
      expect(res.status).toBe(401)
    })

    it("403 for Warden (not a handler)", async () => {
      const api = await as(wardenUser)
      const res = await api.post(`${BASE}/${VALID_ID}/comments`).send({ content: "warden ping" })
      expect(res.status).toBe(403)
    })

    it("422 for empty content (Student allowed)", async () => {
      const api = await as(studentUser)
      const res = await api.post(`${BASE}/${VALID_ID}/comments`).send({ content: "" })
      expect(res.status).toBe(422)
    })

    it("404 from the stub for valid content", async () => {
      const api = await as(studentUser)
      const res = await api
        .post(`${BASE}/${VALID_ID}/comments`)
        .send({ content: "Any update on this?", isInternal: false })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/not implemented yet/)
    })
  })
})
