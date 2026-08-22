import { describe, it, expect, beforeAll, afterAll } from "vitest"
import http from "node:http"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---- storage stub ----------------------------------------------------------
// Every upload endpoint delegates to the storage service via
// storageClient.upload -> POST {STORAGE_SERVICE_URL}/internal/v1/files.
// The real service (:5100) is not running in tests, so we stand up a minimal
// in-process stub on an ephemeral port and point env.storage.serviceUrl at it
// for the duration of this file (restored afterwards).

const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001od0a2db40000000049454e44ae426082".replace(
    /o/g,
    "0"
  ),
  "hex"
)
const PDF_BYTES = Buffer.from("%PDF-1.4\n% fake pdf for tests\n%%EOF\n")
const TEXT_BYTES = Buffer.from("plain text, not allowed anywhere")

let received = [] // { policy, actorRole, entityHint, filename, contentType }
let stubServer = null
let originalServiceUrl = null
let originalInternalKey = null

beforeAll(async () => {
  stubServer = http.createServer((req, res) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      const raw = Buffer.concat(chunks)
      // Crude multipart field extraction — enough for assertions, no parser dep.
      const text = raw.toString("latin1")
      const field = (name) => {
        const m = text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r\\n]+)`))
        return m ? m[1] : ""
      }
      const fileMeta = (() => {
        const m = text.match(/name="file"; filename="([^"]*)"\r\nContent-Type: ([^\r\n]+)/i)
        return m ? { filename: m[1], contentType: m[2] } : { filename: "", contentType: "" }
      })()

      received.push({
        policy: field("policy"),
        actorRole: field("actorRole"),
        entityHint: field("entityHint"),
        filename: fileMeta.filename,
        contentType: fileMeta.contentType,
      })

      const n = received.length
      const name = fileMeta.filename || "upload.bin"
      res.setHeader("content-type", "application/json")
      res.end(
        JSON.stringify({
          file_id: `stub-file-${n}`,
          file_ref: `media://stub/${n}-${name}`,
          url: `http://storage.test/${n}-${name}`,
          content_type: fileMeta.contentType || "application/octet-stream",
          size: raw.length,
          original_name: name,
        })
      )
    })
  })
  await new Promise((resolve) => stubServer.listen(0, "127.0.0.1", resolve))
  // vitest runs from tests/ so dotenv never finds backend/.env — the storage
  // client config is empty and must be pointed at the stub explicitly.
  const { env } = await import("../../../src/config/env.config.js")
  originalServiceUrl = env.storage.serviceUrl
  originalInternalKey = env.storage.internalApiKey
  env.storage.serviceUrl = `http://127.0.0.1:${stubServer.address().port}`
  if (!originalInternalKey) env.storage.internalApiKey = "test-internal-key"
})

afterAll(async () => {
  const { env } = await import("../../../src/config/env.config.js")
  if (originalServiceUrl !== null) env.storage.serviceUrl = originalServiceUrl
  else env.storage.serviceUrl = ""
  if (originalInternalKey !== null) env.storage.internalApiKey = originalInternalKey
  else env.storage.internalApiKey = ""
  await new Promise((resolve) => stubServer.close(resolve))
})

const png = () => Buffer.from(PNG_BYTES)
const pdf = () => Buffer.from(PDF_BYTES)

const expectStoragePayload = (body) => {
  expect(body.fileId).toMatch(/^stub-file-/)
  expect(body.fileRef).toMatch(/^media:\/\/stub\//)
  expect(typeof body.url).toBe("string")
}

// ---------------------------------------------------------------------------

describe("upload — auth wall", () => {
  const endpoints = [
    ["post", "/api/v1/upload/profile/000000000000000000000000"],
    ["post", "/api/v1/upload/student-id/front"],
    ["post", "/api/v1/upload/h2-form"],
    ["post", "/api/v1/upload/event-proposal-pdf"],
    ["post", "/api/v1/upload/disco-process-pdf"],
    ["post", "/api/v1/upload/payment-screenshot"],
    ["post", "/api/v1/upload/certificate"],
    ["post", "/api/v1/upload/signature-image"],
    ["post", "/api/v1/upload/election-nomination-document"],
    ["post", "/api/v1/upload/por-document-pdf"],
  ]
  it("401 on every route without a session", async () => {
    const api = await anon()
    for (const [method, url] of endpoints) {
      const res = await api[method](url).attach("image", png(), "x.png")
      expect([401]).toContain(res.status)
    }
  })
})

describe("upload — profile image", () => {
  it("student uploads own profile image; uploading for another user is 403", async () => {
    const student = await seed.student()
    const other = await seed.student()
    const api = await as(student)

    let res = await api.post(`/api/v1/upload/profile/${student._id}`).attach("image", png(), "me.png")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    res = await api.post(`/api/v1/upload/profile/${other._id}`).attach("image", png(), "not-mine.png")
    expect(res.status).toBe(403)
    expect(res.body.error).toMatch(/permission/i)
  })

  it("rejects missing and non-image files with 400", async () => {
    const student = await seed.student()
    const api = await as(student)

    let res = await api.post(`/api/v1/upload/profile/${student._id}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("No file uploaded")

    res = await api.post(`/api/v1/upload/profile/${student._id}`).attach("image", TEXT_BYTES, "x.txt")
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Uploaded file type is not allowed")
  })

  it("admin may upload on behalf of a student; the stub receives the right policy + hint", async () => {
    const admin = await seed.admin()
    const student = await seed.student()
    const api = await as(admin)

    const before = received.length
    const res = await api.post(`/api/v1/upload/profile/${student._id}`).attach("image", png(), "s.png")
    expect(res.status).toBe(200)

    const entry = received[before]
    expect(entry.policy).toBe("profile-image")
    expect(entry.entityHint).toBe(String(student._id))
    expect(entry.contentType).toBe("image/png")
  })
})

describe("upload — student id card", () => {
  it("students only; both sides accepted; wrong mime refused", async () => {
    const student = await seed.student()
    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.post("/api/v1/upload/student-id/front").attach("image", png(), "w.png")).status).toBe(403)

    const api = await as(student)
    for (const side of ["front", "back"]) {
      const res = await api.post(`/api/v1/upload/student-id/${side}`).attach("image", png(), `${side}.png`)
      expect(res.status).toBe(200)
      expectStoragePayload(res.body)
    }

    const bad = await api.post("/api/v1/upload/student-id/front").attach("image", PDF_BYTES, "x.pdf")
    expect(bad.status).toBe(400)
  })
})

describe("upload — H2 form & event PDFs (Gymkhana-gated)", () => {
  it("H2 form: students only, PDF only", async () => {
    const student = await seed.student()
    const api = await as(student)

    let res = await api.post("/api/v1/upload/h2-form").attach("document", pdf(), "h2.pdf")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    res = await api.post("/api/v1/upload/h2-form").attach("document", png(), "nope.png")
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Only PDF files are allowed")

    const adminApi = await as(await seed.admin())
    expect((await adminApi.post("/api/v1/upload/h2-form").attach("document", pdf(), "h2.pdf")).status).toBe(403)
  })

  it("event proposal/chief-guest/bill/report: Gymkhana role only (Admin is denied by authorizeRoles)", async () => {
    const gymkhana = await seed.createUser({ role: "Gymkhana", subRole: "Councils" })

    const adminApi = await as(await seed.admin())
    // NOTE: the routeGuard map includes Admin but the paired authorizeRoles
    // gate only admits Gymkhana — documented current behavior.
    expect(
      (await adminApi.post("/api/v1/upload/event-proposal-pdf").attach("document", pdf(), "p.pdf")).status
    ).toBe(403)

    const api = await as(gymkhana)
    for (const url of [
      "/api/v1/upload/event-proposal-pdf",
      "/api/v1/upload/event-chief-guest-pdf",
      "/api/v1/upload/event-bill-pdf",
      "/api/v1/upload/event-report-pdf",
    ]) {
      const res = await api.post(url).attach("document", pdf(), "doc.pdf")
      expect(res.status).toBe(200)
      expectStoragePayload(res.body)

      const badMime = await api.post(url).attach("document", png(), "pic.png")
      expect(badMime.status).toBe(400)
    }
  })
})

describe("upload — payment screenshot & lost-and-found image", () => {
  it("payment screenshot: students and admins, images only", async () => {
    const student = await seed.student()
    const api = await as(student)

    let res = await api.post("/api/v1/upload/payment-screenshot").attach("image", png(), "proof.png")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    res = await api.post("/api/v1/upload/payment-screenshot").attach("image", PDF_BYTES, "fake.pdf")
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Only image files/i)

    const adminApi = await as(await seed.admin())
    expect((await adminApi.post("/api/v1/upload/payment-screenshot").attach("image", png(), "qr.png")).status).toBe(200)

    const wardenApi = await as(await seed.warden())
    expect((await wardenApi.post("/api/v1/upload/payment-screenshot").attach("image", png(), "w.png")).status).toBe(403)
  })

  it("lost-and-found image: staff roles allowed, students refused", async () => {
    const wardenApi = await as(await seed.warden())
    let res = await wardenApi.post("/api/v1/upload/lost-and-found-image").attach("image", png(), "item.png")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    res = await wardenApi.post("/api/v1/upload/lost-and-found-image").attach("image", TEXT_BYTES, "x.txt")
    expect(res.status).toBe(400)

    const studentApi = await as(await seed.student())
    expect((await studentApi.post("/api/v1/upload/lost-and-found-image").attach("image", png(), "s.png")).status).toBe(403)
  })
})

describe("upload — signature image & certificate", () => {
  it("signature image: any authenticated user, images only", async () => {
    const studentApi = await as(await seed.student())
    let res = await studentApi.post("/api/v1/upload/signature-image").attach("image", png(), "sig.png")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    res = await studentApi.post("/api/v1/upload/signature-image").attach("image", PDF_BYTES, "sig.pdf")
    expect(res.status).toBe(400)
  })

  it("certificate: Admin only, mixed pdf/image, studentId becomes entityHint", async () => {
    const student = await seed.student()
    const api = await as(await seed.admin())

    const before = received.length
    let res = await api
      .post("/api/v1/upload/certificate")
      .field("studentId", String(student._id))
      .attach("document", pdf(), "cert.pdf")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)
    expect(received[before].policy).toBe("certificate")
    expect(received[before].entityHint).toBe(String(student._id))

    res = await api.post("/api/v1/upload/certificate").attach("document", TEXT_BYTES, "x.txt")
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Only PDF and image files are allowed")

    const studentApi = await as(student)
    expect((await studentApi.post("/api/v1/upload/certificate").attach("document", pdf(), "c.pdf")).status).toBe(403)
  })
})

describe("upload — size limits (election nomination / POR / disCo)", () => {
  const bigPdf = () => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(10 * 1024 * 1024 + 1, 1)])

  it("election nomination document rejects >10MB at multer level with 400", async () => {
    const api = await as(await seed.student())
    const res = await api
      .post("/api/v1/upload/election-nomination-document")
      .attach("document", bigPdf(), "big.pdf")
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.body)).toMatch(/10MB or smaller/)
  })

  it("por document pdf: students only, happy path hits the por policy", async () => {
    const api = await as(await seed.student())
    const before = received.length
    const res = await api.post("/api/v1/upload/por-document-pdf").attach("document", pdf(), "por.pdf")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)
    expect(received[before].policy).toBe("por-document-pdf")

    const adminApi = await as(await seed.admin())
    expect((await adminApi.post("/api/v1/upload/por-document-pdf").attach("document", pdf(), "a.pdf")).status).toBe(403)
  })

  it("disco process pdf: Admin/Super Admin only", async () => {
    const adminApi = await as(await seed.admin())
    let res = await adminApi.post("/api/v1/upload/disco-process-pdf").attach("document", pdf(), "disco.pdf")
    expect(res.status).toBe(200)
    expectStoragePayload(res.body)

    const studentApi = await as(await seed.student())
    expect((await studentApi.post("/api/v1/upload/disco-process-pdf").attach("document", pdf(), "d.pdf")).status).toBe(403)
  })
})
