import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import { fileURLToPath } from "url"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"
import { resolveLegacyUploadPath } from "../../../src/services/storage/file-ref.service.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const uploadsRoot = path.resolve(__dirname, "../../../uploads")

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

const BASE = "/api/v1/media"

describe("GET /media/resolve", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/resolve`).query({ ref: "media://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("400 when ref is missing", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/resolve`)
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Media ref is required/i)
  })

  it("400 for path-traversal and http refs", async () => {
    const student = await seed.student()
    const api = await as(student)

    const traversal = await api.get(`${BASE}/resolve`).query({ ref: "/uploads/../../.env" })
    expect(traversal.status).toBe(400)
    expect(traversal.body.success).toBe(false)

    const ssrf = await api.get(`${BASE}/resolve`).query({ ref: "http://127.0.0.1/" })
    expect(ssrf.status).toBe(400)
    expect(ssrf.body.success).toBe(false)

    const absolute = await api.get(`${BASE}/resolve`).query({ ref: "/etc/passwd" })
    expect(absolute.status).toBe(400)
    expect(absolute.body.success).toBe(false)
  })
})

describe("POST /media/resolve-batch", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/resolve-batch`).send({
      refs: ["media://aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"],
    })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })
})

describe("fileAccessService.getBuffer", () => {
  it("rejects path traversal, remote URLs, and absolute paths", async () => {
    await expect(fileAccessService.getBuffer("/uploads/../../.env")).rejects.toThrow(/Invalid path|Unsupported/)
    await expect(fileAccessService.getBuffer("http://127.0.0.1/")).rejects.toThrow(
      /Remote HTTP file references are not supported/
    )
    await expect(fileAccessService.getBuffer("https://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      /Remote HTTP file references are not supported/
    )
    // paths outside the uploads root are rejected as invalid before the
    // generic unsupported-reference fallback fires
    await expect(fileAccessService.getBuffer("/etc/passwd")).rejects.toThrow(/Invalid path|Unsupported/)
  })
})

describe("resolveLegacyUploadPath", () => {
  it("keeps paths inside the uploads root and rejects escapes", () => {
    const nested = resolveLegacyUploadPath("/uploads/id-cards/front.jpg", uploadsRoot)
    expect(nested).toBe(path.resolve(uploadsRoot, "id-cards/front.jpg"))

    expect(resolveLegacyUploadPath("/uploads/../../.env", uploadsRoot)).toBeNull()
    expect(resolveLegacyUploadPath("/uploads//etc/passwd", uploadsRoot)).toBeNull()
    expect(resolveLegacyUploadPath("/etc/passwd", uploadsRoot)).toBeNull()
  })
})
