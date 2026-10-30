import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  utcDay,
  dayKey,
  createStudentProfile,
  createCaterer,
  createDiningPeriod,
  createDiningAllocation,
} from "../../helpers/seed/students.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"

const BASE = "/api/v1/students/dining"
const FORM_REQUIRED = "Please upload the filled long-term rebate form"
const INVALID_FORM = "The rebate form must be a file you uploaded for this rebate request"
const TEMPLATE_REF = "media://blank-template-1"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (from, to) => ({ startDate: dayKey(utcDay(from)), endDate: dayKey(utcDay(to)) })

describe("dining rebate forms (preview, long-term form, serialization)", () => {
  let student
  let studentApi
  let adminApi
  let period

  // Storage metadata stub: refs map to { policy, actorId }.
  const files = new Map()
  const stubMetadata = () =>
    vi.spyOn(fileAccessService, "getMetadata").mockImplementation(async (ref) => {
      const meta = files.get(ref)
      if (!meta) throw new Error("File not found")
      return { fileRef: ref, policy: meta.policy, actorId: meta.actorId, actorRole: "Student", entityHint: "", contentType: "application/pdf" }
    })

  beforeAll(async () => {
    student = await seed.student()
    const profile = await createStudentProfile({ userId: student._id, rollNumber: "RBF001" })
    const caterer = await createCaterer({ name: "Form Mess" })
    period = await createDiningPeriod({
      eligibilityMode: "custom",
      eligibleRollNumbers: ["RBF001"],
      startDate: utcDay(3),
      endDate: utcDay(80),
    })
    await createDiningAllocation({
      periodId: period._id,
      studentUserId: student._id,
      studentProfileId: profile._id,
      rollNumber: "RBF001",
      catererId: caterer._id,
    })
    studentApi = await as(student)
    adminApi = await as(await seed.admin())
  })

  it("GET /rebates exposes longTermForm: null when no template is configured", async () => {
    const res = await studentApi.get(`${BASE}/rebates`)
    expect(res.status).toBe(200)
    expect(res.body.data.longTermForm).toBeNull()
  })

  it("preview returns the short-term segment shape and saves nothing", async () => {
    const res = await studentApi.post(`${BASE}/rebates/preview`).send(range(5, 6))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({
      segments: [
        {
          periodId: String(period._id),
          startDate: utcDay(5).toISOString(),
          endDate: utcDay(6).toISOString(),
          dayCount: 2,
          type: "short-term",
          status: "approved",
        },
      ],
      hasLongTerm: false,
      formRequired: false,
    })

    const list = await studentApi.get(`${BASE}/rebates`)
    expect(list.body.data.rebates).toEqual([])
  })

  it("preview returns the same 400 errors as create", async () => {
    let res = await studentApi.post(`${BASE}/rebates/preview`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Valid rebate start and end dates are required")

    res = await studentApi.post(`${BASE}/rebates/preview`).send(range(200, 201))
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No dining period is configured for the selected dates")
  })

  it("long-term without a configured template: preview formRequired=false, create needs no form", async () => {
    const preview = await studentApi.post(`${BASE}/rebates/preview`).send(range(10, 13))
    expect(preview.status).toBe(200)
    expect(preview.body.data.hasLongTerm).toBe(true)
    expect(preview.body.data.formRequired).toBe(false)
    expect(preview.body.data.segments[0]).toMatchObject({ type: "long-term", status: "pending", dayCount: 4 })

    const res = await studentApi.post(`${BASE}/rebates`).send({ ...range(10, 13), reason: "No template yet" })
    expect(res.status).toBe(201)
    expect(res.body.data.rebates[0].type).toBe("long-term")
    expect(res.body.data.rebates[0].form).toBeNull()
  })

  it("once Admin configures the template, GET /rebates returns it and preview requires a form", async () => {
    const put = await adminApi
      .put("/api/v1/config/diningRebate")
      .send({ value: { longTermFormRef: TEMPLATE_REF, longTermFormName: "Long-term rebate form.pdf" } })
    expect(put.status).toBe(200)

    const list = await studentApi.get(`${BASE}/rebates`)
    expect(list.body.data.longTermForm).toEqual({ ref: TEMPLATE_REF, name: "Long-term rebate form.pdf" })

    const preview = await studentApi.post(`${BASE}/rebates/preview`).send(range(20, 23))
    expect(preview.body.data).toMatchObject({ hasLongTerm: true, formRequired: true })

    const shortPreview = await studentApi.post(`${BASE}/rebates/preview`).send(range(15, 15))
    expect(shortPreview.body.data).toMatchObject({ hasLongTerm: false, formRequired: false })
  })

  it("long-term create without a form is rejected when a template is configured", async () => {
    const res = await studentApi.post(`${BASE}/rebates`).send({ ...range(20, 23), reason: "Trip" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(FORM_REQUIRED)
  })

  it("rejects a form uploaded by someone else, under the wrong policy, unknown, or not a media ref", async () => {
    const other = await seed.student()
    files.set("media://someone-else", { policy: "dining-rebate-forms", actorId: String(other._id) })
    files.set("media://wrong-policy", { policy: "h2-forms", actorId: String(student._id) })
    stubMetadata()

    for (const ref of ["media://someone-else", "media://wrong-policy", "media://missing-file", "https://x.test/a.pdf"]) {
      const res = await studentApi
        .post(`${BASE}/rebates`)
        .send({ ...range(20, 23), reason: "Trip", form: { ref, name: "f.pdf" } })
      expect(res.status, ref).toBe(400)
      expect(res.body.message).toBe(INVALID_FORM)
    }

    const list = await studentApi.get(`${BASE}/rebates`)
    expect(list.body.data.rebates.some((r) => r.dateKeys.includes(dayKey(utcDay(20))))).toBe(false)
  })

  it("accepts the student's own form and serializes it for the student and the admin list", async () => {
    files.set("media://my-form", { policy: "dining-rebate-forms", actorId: String(student._id) })
    const spy = stubMetadata()

    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ ...range(20, 23), reason: "Semester break", form: { ref: " media://my-form ", name: " filled.pdf " } })
    expect(res.status).toBe(201)
    expect(spy).toHaveBeenCalledWith("media://my-form")
    const created = res.body.data.rebates[0]
    expect(created.status).toBe("pending")
    expect(created.form).toMatchObject({ ref: "media://my-form", name: "filled.pdf" })
    expect(typeof created.form.uploadedAt).toBe("string")

    const adminList = await adminApi.get("/api/v1/admin/dining-rebates").query({ status: "pending" })
    expect(adminList.status).toBe(200)
    const rows = adminList.body.data?.rebates ?? adminList.body.rebates
    const row = rows.find((r) => String(r.id) === String(created.id))
    expect(row.form).toMatchObject({ ref: "media://my-form", name: "filled.pdf" })
    expect(row.reason).toBe("Semester break")
    const older = rows.find((r) => r.reason === "No template yet")
    expect(older.form).toBeNull()
  })

  it("short-term requests ignore the form entirely (no storage lookup, form stays null)", async () => {
    const spy = stubMetadata()
    const res = await studentApi
      .post(`${BASE}/rebates`)
      .send({ ...range(30, 31), reason: "Weekend", form: { ref: "not-a-ref", name: "x" } })
    expect(res.status).toBe(201)
    expect(res.body.data.rebates[0].type).toBe("short-term")
    expect(res.body.data.rebates[0].form).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })
})
