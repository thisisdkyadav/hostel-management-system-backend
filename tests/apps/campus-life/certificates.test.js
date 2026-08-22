/**
 * Certificates module integration tests (/api/v1/certificate).
 *
 * NOTE: this module uses the legacy response style — controllers emit
 * `result.data` directly (no { success, data } wrapper), and the ServiceResponse
 * `success()` message-hoist moves `message` out of the payload, so e.g.
 * POST /add responds 201 with body `{ certificate }` and DELETE responds `{}`.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { campusSeed } from "../../helpers/seed/campusLife.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("certificates — authn/authz", () => {
  let studentUser, studentProfile

  beforeAll(async () => {
    const { user, profile } = await campusSeed.studentWithProfile()
    studentUser = user
    studentProfile = profile
  })

  it("401 for unauthenticated requests on all routes", async () => {
    const api = await anon()
    expect((await api.post("/api/v1/certificate/add").send({})).status).toBe(401)
    expect((await api.get(`/api/v1/certificate/${studentUser._id}`)).status).toBe(401)
    expect((await api.put("/api/v1/certificate/update/abc").send({})).status).toBe(401)
    expect((await api.delete("/api/v1/certificate/abc")).status).toBe(401)
  })

  it("403 for roles outside the route guard", async () => {
    const studentApi = await as(await seed.student())
    const res = await studentApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(studentUser._id), certificateType: "Bonafide", certificateUrl: "/x.pdf" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Access denied/)

    const wardenApi = await as(await seed.warden())
    // Warden may read...
    const readRes = await wardenApi.get(`/api/v1/certificate/${studentUser._id}`)
    expect(readRes.status).toBe(200)
    // ...but not write (Admin-only management).
    expect(
      (await wardenApi.put("/api/v1/certificate/update/000000000000000000000000").send({ remarks: "x" })).status
    ).toBe(403)
    expect(
      (await wardenApi.delete("/api/v1/certificate/000000000000000000000000")).status
    ).toBe(403)

    const securityApi = await as(await seed.security())
    expect((await securityApi.get(`/api/v1/certificate/${studentUser._id}`)).status).toBe(403)
  })
})

describe("certificates — POST /add", () => {
  let adminApi, studentUser

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: studentUser } = await campusSeed.studentWithProfile())
  })

  it("400 Invalid ID format when studentId is not a valid ObjectId", async () => {
    const res = await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: "not-an-objectid", certificateType: "Bonafide", certificateUrl: "/u.pdf" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("404 when the student has no profile", async () => {
    const stranger = await seed.student()
    const res = await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(stranger._id), certificateType: "Bonafide", certificateUrl: "/u.pdf" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Student profile not found")
  })

  it("500 when required model fields are missing (documented current behavior)", async () => {
    // SUSPECTED BUG: missing input is surfaced as 500 "Failed to create
    // Certificate" instead of a 4xx validation error.
    const res = await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(studentUser._id) })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to create Certificate")
  })

  it("201 happy path — persists and returns the certificate", async () => {
    const issueDate = "2026-01-15T00:00:00.000Z"
    const res = await adminApi.post("/api/v1/certificate/add").send({
      studentId: String(studentUser._id),
      certificateType: "Bonafide",
      certificateUrl: "/uploads/bonafide.pdf",
      issueDate,
      remarks: "issued for visa",
    })
    expect(res.status).toBe(201)
    // message is hoisted away by success(); only data is emitted.
    expect(res.body.certificate).toBeDefined()
    expect(String(res.body.certificate.userId)).toBe(String(studentUser._id))
    expect(res.body.certificate.certificateType).toBe("Bonafide")
    expect(res.body.certificate.certificateUrl).toBe("/uploads/bonafide.pdf")

    const listRes = await adminApi.get(`/api/v1/certificate/${studentUser._id}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.certificates).toHaveLength(1)
    expect(String(listRes.body.certificates[0]._id)).toBe(String(res.body.certificate._id))
  })

  it("allows duplicate certificates (no unique index) — documented behavior", async () => {
    const payload = {
      studentId: String(studentUser._id),
      certificateType: "Character",
      certificateUrl: "/uploads/character.pdf",
    }
    const first = await adminApi.post("/api/v1/certificate/add").send(payload)
    const second = await adminApi.post("/api/v1/certificate/add").send(payload)
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
  })
})

describe("certificates — GET /:studentId", () => {
  let adminApi, studentUser

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: studentUser } = await campusSeed.studentWithProfile())
  })

  it("returns an empty list for a student without certificates", async () => {
    const res = await adminApi.get(`/api/v1/certificate/${studentUser._id}`)
    expect(res.status).toBe(200)
    // `message` is hoisted out of the payload by success(); only
    // { success, certificates } is emitted.
    expect(res.body.success).toBe(true)
    expect(res.body.certificates).toEqual([])
  })

  it("returns all certificates of the student", async () => {
    await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(studentUser._id), certificateType: "Bonafide", certificateUrl: "/a.pdf" })
    await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(studentUser._id), certificateType: "NOC", certificateUrl: "/b.pdf" })

    const res = await adminApi.get(`/api/v1/certificate/${studentUser._id}`)
    expect(res.status).toBe(200)
    expect(res.body.certificates).toHaveLength(2)
    const types = res.body.certificates.map((c) => c.certificateType).sort()
    expect(types).toEqual(["Bonafide", "NOC"])
  })

  it("is scoped per student", async () => {
    const { user: other } = await campusSeed.studentWithProfile()
    await adminApi
      .post("/api/v1/certificate/add")
      .send({ studentId: String(other._id), certificateType: "Bonafide", certificateUrl: "/o.pdf" })

    const res = await adminApi.get(`/api/v1/certificate/${other._id}`)
    expect(res.body.certificates).toHaveLength(1)
  })
})

describe("certificates — PUT /update/:certificateId", () => {
  let adminApi, studentUser, certificateId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: studentUser } = await campusSeed.studentWithProfile())
    const res = await adminApi.post("/api/v1/certificate/add").send({
      studentId: String(studentUser._id),
      certificateType: "Bonafide",
      certificateUrl: "/a.pdf",
      remarks: "original",
    })
    certificateId = res.body.certificate._id
  })

  it("404 for an unknown but valid id", async () => {
    const res = await adminApi
      .put("/api/v1/certificate/update/000000000000000000000000")
      .send({ remarks: "nope" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Certificate not found")
  })

  it("400 Invalid ID format for a malformed id", async () => {
    // CastError now propagates to the global handler instead of being
    // swallowed into a generic 500.
    const res = await adminApi.put("/api/v1/certificate/update/garbage").send({ remarks: "x" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("200 happy path — updates fields and persists", async () => {
    const res = await adminApi.put(`/api/v1/certificate/update/${certificateId}`).send({
      remarks: "updated remark",
      certificateType: "Transfer",
    })
    expect(res.status).toBe(200)
    expect(res.body.certificate.remarks).toBe("updated remark")
    expect(res.body.certificate.certificateType).toBe("Transfer")

    const getRes = await adminApi.get(`/api/v1/certificate/${studentUser._id}`)
    const updated = getRes.body.certificates.find((c) => String(c._id) === String(certificateId))
    expect(updated.remarks).toBe("updated remark")
  })
})

describe("certificates — DELETE /:certificateId", () => {
  let adminApi, studentUser

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    ;({ user: studentUser } = await campusSeed.studentWithProfile())
  })

  it("404 for an unknown certificate", async () => {
    const res = await adminApi.delete("/api/v1/certificate/000000000000000000000000")
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Certificate not found")
  })

  it("200 deletes and the follow-up GET no longer lists it", async () => {
    const created = await adminApi.post("/api/v1/certificate/add").send({
      studentId: String(studentUser._id),
      certificateType: "Bonafide",
      certificateUrl: "/del.pdf",
    })
    const id = created.body.certificate._id

    const delRes = await adminApi.delete(`/api/v1/certificate/${id}`)
    expect(delRes.status).toBe(200)
    // message hoisted; empty data object emitted.
    expect(delRes.body).toEqual({})

    const getRes = await adminApi.get(`/api/v1/certificate/${studentUser._id}`)
    expect(getRes.body.certificates.find((c) => String(c._id) === String(id))).toBeUndefined()
  })
})
