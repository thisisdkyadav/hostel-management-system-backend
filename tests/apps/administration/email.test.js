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

// SUSPECTED BUG (schema/contract mismatch — current behavior is tested here):
// sendEmailSchema wraps every field under `body: Joi.object({...})`, but the
// validate() middleware already validates req.body itself (every other module
// keeps its schema flat, e.g. student.validation.js). Consequences:
//   1. A flat, correctly-shaped request { to, subject, body } ALWAYS fails
//      validation with 422 '"body" must be of type object'.
//   2. The only payload that passes is nested ({ body: { to, subject, body }}),
//      but the controller then reads req.body.to / .subject / .body at the TOP
//      level — all undefined — so sendType/group handling is unreachable and
//      every accepted request degrades to a single-recipient send of garbage
//      fields.
// Responses go through sendRawResponse -> only result.data reaches the client
// on success, so success messages never appear in response bodies.
const BASE = "/api/v1/email"
const FLAT_BODY = {
  to: "recipient@hms.test",
  subject: "Integration test email",
  body: "<p>Hello from the integration suite</p>",
}
const NESTED_BODY = { body: { ...FLAT_BODY } }

describe("GET /email/status", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/status`)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/status`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/access/i)
  })

  it("403 for a warden", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.get(`${BASE}/status`)
    expect(res.status).toBe(403)
  })

  it("reports not_configured for an Admin when SMTP is disabled", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/status`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      configured: false,
      status: "not_configured",
      error: "SMTP not configured",
    })
  })

  it("is also reachable by a Super Admin", async () => {
    const superAdmin = await seed.superAdmin()
    const api = await as(superAdmin)
    const res = await api.get(`${BASE}/status`)
    expect(res.status).toBe(200)
    expect(res.body.configured).toBe(false)
    expect(res.body.status).toBe("not_configured")
  })
})

describe("POST /email/send — auth + validation", () => {
  let adminApi

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/send`).send(FLAT_BODY)
    expect(res.status).toBe(401)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.post(`${BASE}/send`).send(FLAT_BODY)
    expect(res.status).toBe(403)
  })

  it("SUSPECTED BUG: rejects the documented flat payload with 422 forever", async () => {
    // Current behavior: any flat { to, subject, body } request is rejected by
    // Joi because the schema expects those fields under a literal `body` key.
    const res = await adminApi.post(`${BASE}/send`).send(FLAT_BODY)
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.errors[0]).toMatchObject({
      field: "body",
      message: expect.stringMatching(/must be of type object/i),
    })
  })

  it("SUSPECTED BUG: a completely empty payload skips validation and hits the transport (500)", async () => {
    // The wrapper key `body` is not marked .required(), so {} validates fine
    // and the request degrades to an undefined-field single send.
    const res = await adminApi.post(`${BASE}/send`).send({})
    expect(res.status).toBe(500)
    expect(res.body.message).toMatch(/not configured/i)
  })

  it("422 when required fields are missing inside the nested body", async () => {
    const res = await adminApi.post(`${BASE}/send`).send({ body: {} })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)

    const fields = res.body.errors.map((e) => e.field)
    for (const field of ["body.to", "body.subject", "body.body"]) {
      expect(fields).toContain(field)
    }
  })

  it("422 for a malformed recipient address", async () => {
    const res = await adminApi.post(`${BASE}/send`).send({
      body: { ...FLAT_BODY, to: "not-an-email" },
    })
    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe("body.to")
  })

  it("422 for an empty recipient array", async () => {
    const res = await adminApi.post(`${BASE}/send`).send({
      body: { ...FLAT_BODY, to: [] },
    })
    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe("body.to")
  })

  it("422 for an invalid sendType", async () => {
    const res = await adminApi.post(`${BASE}/send`).send({
      body: { ...FLAT_BODY, sendType: "blast" },
    })
    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe("body.sendType")
  })

  it("422 for a subject over 200 characters", async () => {
    const res = await adminApi.post(`${BASE}/send`).send({
      body: { ...FLAT_BODY, subject: "x".repeat(201) },
    })
    expect(res.status).toBe(422)
    expect(res.body.errors[0].field).toBe("body.subject")
  })
})

describe("POST /email/send — SMTP-disabled no-op behavior", () => {
  let adminApi

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
  })

  it("a Super Admin passes the role guard and hits the same validation contract", async () => {
    const superAdmin = await seed.superAdmin()
    const saApi = await as(superAdmin)

    // flat payload -> same 422 as the Admin actor
    const flat = await saApi.post(`${BASE}/send`).send(FLAT_BODY)
    expect(flat.status).toBe(422)
    expect(flat.body.errors[0].field).toBe("body")

    // nested payload passes validation and degrades at the disabled transport
    const nested = await saApi.post(`${BASE}/send`).send(NESTED_BODY)
    expect(nested.status).toBe(500)
    expect(nested.body.message).toMatch(/not configured/i)
  })

  it("nested single-recipient payload passes validation, fails at the disabled transport with 500", async () => {
    const res = await adminApi.post(`${BASE}/send`).send(NESTED_BODY)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({
      message: "Failed to send email: Email service not configured",
    })
  })

  it("SUSPECTED BUG: multi-recipient payloads never reach the group branch", async () => {
    // Even when a client works around the schema by nesting, the controller
    // reads to/subject/body from the top level, so `to` arrives undefined,
    // recipients collapse to [undefined] (length 1), and the per-recipient
    // group branch in the service (sent/failed counts) is unreachable over
    // HTTP. Documented current behavior: same 500 as a single recipient.
    const res = await adminApi.post(`${BASE}/send`).send({
      body: {
        to: ["a@hms.test", "b@hms.test"],
        subject: "Integration test email",
        body: "<p>Hello</p>",
        sendType: "group",
      },
    })
    expect(res.status).toBe(500)
    expect(res.body.message).toMatch(/not configured/i)
  })
})
