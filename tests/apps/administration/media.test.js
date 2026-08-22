import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "path"
import http from "node:http"
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

// ---------------------------------------------------------------------------
// Storage sign stub
//
// The happy paths of /media/resolve(+batch) delegate to storageClient.sign ->
// POST {STORAGE_SERVICE_URL}/internal/v1/files/sign. The real service is not
// running here, so we stand up an in-process stub that serves a configurable
// file registry (policy + actor metadata + soft-delete flag), then point
// env.storage at it for the duration of this describe block only.
// ---------------------------------------------------------------------------

describe("media resolution against a storage stub", () => {
  let stubServer = null
  let baseUrl = ""
  let originalServiceUrl = null
  let originalInternalKey = null

  // fileRef -> { policy, actorId, actorRole, entityHint, deleted }
  const files = new Map()
  const signRequests = [] // captured { file_ref, expires_in_seconds, disposition }
  let omitPolicy = false

  const REF_A = "media://aaaaaaaa-0000-0000-0000-000000000001"
  const REF_B = "media://aaaaaaaa-0000-0000-0000-000000000002"
  const REF_MISSING = "media://aaaaaaaa-0000-0000-0000-00000000dead"

  beforeAll(async () => {
    stubServer = http.createServer((req, res) => {
      const chunks = []
      req.on("data", (c) => chunks.push(c))
      req.on("end", () => {
        if (req.method !== "POST" || req.url !== "/internal/v1/files/sign") {
          res.writeHead(404, { "content-type": "application/json" })
          return res.end(JSON.stringify({ message: "Unknown stub route" }))
        }

        let body = {}
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"))
        } catch {}
        signRequests.push(body)

        const entry = files.get(String(body.file_ref || ""))
        if (!entry || entry.deleted) {
          res.writeHead(404, { "content-type": "application/json" })
          return res.end(JSON.stringify({ message: "File not found" }))
        }

        const payload = {
          url: `/signed/${encodeURIComponent(String(body.file_ref))}`,
          file_ref: String(body.file_ref),
        }
        if (!omitPolicy) {
          Object.assign(payload, {
            policy: entry.policy,
            actor_id: entry.actorId,
            actor_role: entry.actorRole,
            entity_hint: entry.entityHint,
          })
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify(payload))
      })
    })
    await new Promise((resolve) => stubServer.listen(0, "127.0.0.1", resolve))
    baseUrl = `http://127.0.0.1:${stubServer.address().port}`

    const { env } = await import("../../../src/config/env.config.js")
    originalServiceUrl = env.storage.serviceUrl
    originalInternalKey = env.storage.internalApiKey
    env.storage.serviceUrl = baseUrl
    if (!env.storage.internalApiKey) env.storage.internalApiKey = "test-internal-key"

    files.set(REF_A, { policy: "profile-images", actorId: "", actorRole: "", entityHint: "" })
    files.set(REF_B, { policy: "student-id-cards", actorId: "", actorRole: "", entityHint: "" })
  })

  afterAll(async () => {
    const { env } = await import("../../../src/config/env.config.js")
    if (originalServiceUrl !== null) env.storage.serviceUrl = originalServiceUrl
    else env.storage.serviceUrl = ""
    if (originalInternalKey !== null) env.storage.internalApiKey = originalInternalKey
    else env.storage.internalApiKey = ""
    await new Promise((resolve) => stubServer.close(resolve))
  })

  describe("GET /media/resolve (stub)", () => {
    it("200 envelope { success, data: { ref, url } } for a permitted ref", async () => {
      const student = await seed.student()
      files.get(REF_A).actorId = String(student._id)
      const api = await as(student)

      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_A })
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.ref).toBe(REF_A)
      // storageClient prefixes relative URLs with the stub base
      expect(res.body.data.url.startsWith(baseUrl)).toBe(true)

      // disposition defaults to inline
      expect(signRequests.at(-1)).toMatchObject({ file_ref: REF_A, disposition: "inline" })
    })

    it("owner match: the uploading actor may always resolve their own restricted file", async () => {
      const student = await seed.student()
      files.set(REF_B, {
        policy: "student-id-cards",
        actorId: String(student._id),
        actorRole: "Student",
        entityHint: "",
      })
      const api = await as(student)
      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_B })
      expect(res.status).toBe(200)
    })

    it("403 for a different student resolving someone else's student-id-card", async () => {
      const owner = await seed.student()
      const other = await seed.student()
      files.set(REF_B, {
        policy: "student-id-cards",
        actorId: String(owner._id),
        actorRole: "Student",
        entityHint: `${owner._id}:front`,
      })
      const api = await as(other)
      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_B })
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/do not have access/i)
    })

    it("profile-images is open to every authenticated caller (even non-owner)", async () => {
      const owner = await seed.student()
      const stranger = await seed.student()
      files.set(REF_A, {
        policy: "profile-images",
        actorId: String(owner._id),
        actorRole: "Student",
        entityHint: "",
      })
      const api = await as(stranger)
      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_A })
      expect(res.status).toBe(200)
    })

    it("payment-screenshots are visible to students when an Admin uploaded them", async () => {
      const admin = await seed.admin()
      const student = await seed.student()
      files.set(REF_A, {
        policy: "payment-screenshots",
        actorId: String(admin._id),
        actorRole: "Admin",
        entityHint: "",
      })
      const api = await as(student)
      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_A })
      expect(res.status).toBe(200)
    })

    it("Gymkhana staff can resolve gymkhana-policy files (election nomination docs)", async () => {
      const gymkhana = await seed.createUser({ role: "Gymkhana", subRole: "Councils" })
      const student = await seed.student()
      files.set(REF_A, {
        policy: "election-nomination-docs",
        actorId: String(student._id),
        actorRole: "Student",
        entityHint: "",
      })
      const api = await as(gymkhana)
      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_A })
      expect(res.status).toBe(200)
    })

    it("?redirect=1 answers 302 with a Location header instead of JSON", async () => {
      const student = await seed.student()
      files.set(REF_A, {
        policy: "profile-images",
        actorId: String(student._id),
        actorRole: "Student",
        entityHint: "",
      })
      const api = await as(student)
      const res = await api
        .get(`${BASE}/resolve`)
        .query({ ref: REF_A, redirect: "1" })
        .redirects(0)
      expect(res.status).toBe(302)
      expect(res.headers.location.startsWith(baseUrl)).toBe(true)
    })

    it("clamps expiresInSeconds to [1, 300] and falls back to 300 for junk values", async () => {
      const student = await seed.student()
      const api = await as(student)

      await api.get(`${BASE}/resolve`).query({ ref: REF_A, expiresInSeconds: "99999" })
      expect(signRequests.at(-1).expires_in_seconds).toBe(300)

      await api.get(`${BASE}/resolve`).query({ ref: REF_A, expiresInSeconds: "banana" })
      expect(signRequests.at(-1).expires_in_seconds).toBe(300)

      await api.get(`${BASE}/resolve`).query({ ref: REF_A, expiresInSeconds: "0" })
      expect(signRequests.at(-1).expires_in_seconds).toBe(300)

      await api.get(`${BASE}/resolve`).query({ ref: REF_A, expiresInSeconds: "5" })
      expect(signRequests.at(-1)).toMatchObject({ expires_in_seconds: 5, disposition: "inline" })
    })

    it("404 File once the underlying file is gone (delete-then-access)", async () => {
      const student = await seed.student()
      files.set(REF_MISSING, { policy: "h2-forms", actorId: String(student._id), actorRole: "Student", entityHint: "" })
      files.get(REF_MISSING).deleted = true
      const api = await as(student)

      const res = await api.get(`${BASE}/resolve`).query({ ref: REF_MISSING })
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/file not found/i)
    })

    it("SUSPECTED BUG (fail-open): a sign response without policy metadata is allowed through for anyone", async () => {
      // The service logs a warning and treats the file as resolvable by any
      // authenticated caller when the storage stub omits policy metadata.
      const stranger = await seed.student()
      files.set(REF_B, { policy: "student-id-cards", actorId: "someone-else", actorRole: "Student", entityHint: "" })
      omitPolicy = true
      try {
        const api = await as(stranger)
        const res = await api.get(`${BASE}/resolve`).query({ ref: REF_B })
        expect(res.status).toBe(200) // current behavior; arguably should fail closed
      } finally {
        omitPolicy = false
      }
    })

    it("400 for non-media refs: legacy /uploads paths and pattern-breaking media refs", async () => {
      const student = await seed.student()
      const api = await as(student)

      const legacy = await api.get(`${BASE}/resolve`).query({ ref: "/uploads/id-cards/front.jpg" })
      expect(legacy.status).toBe(400)
      expect(legacy.body.message).toMatch(/Invalid file reference/i)

      const dots = await api.get(`${BASE}/resolve`).query({ ref: "media://../etc/passwd" })
      expect(dots.status).toBe(400)

      const spaces = await api.get(`${BASE}/resolve`).query({ ref: "media://has space" })
      expect(spaces.status).toBe(400)
    })
  })

  describe("POST /media/resolve-batch (stub)", () => {
    it("resolves each unique ref; per-item errors instead of failing the whole batch", async () => {
      const student = await seed.student()
      files.get(REF_A).deleted = false
      files.get(REF_A).policy = "profile-images"
      files.get(REF_A).actorId = String(student._id)
      files.set(REF_B, { policy: "student-id-cards", actorId: String(student._id), actorRole: "Student", entityHint: "" })
      files.set(REF_MISSING, { policy: "h2-forms", actorId: String(student._id), actorRole: "Student", entityHint: "" })
      files.get(REF_MISSING).deleted = true

      const api = await as(student)
      const res = await api.post(`${BASE}/resolve-batch`).send({
        refs: [REF_A, REF_B, REF_MISSING, REF_A, "not-a-ref"],
      })
      expect(res.status).toBe(200)
      // duplicates collapse, non-string/junk refs drop out
      expect(res.body.data.items).toHaveLength(4)
      const byRef = Object.fromEntries(res.body.data.items.map((i) => [i.ref, i]))
      expect(byRef[REF_A].url.startsWith(baseUrl)).toBe(true)
      expect(byRef[REF_B].url.startsWith(baseUrl)).toBe(true)
      expect(byRef[REF_MISSING].url).toBe("")
      expect(byRef[REF_MISSING].error).toMatch(/file not found/i)
      expect(byRef["not-a-ref"].error).toMatch(/Invalid file reference/i)
    })

    it("empty refs list returns an empty items array; >50 refs is a 400", async () => {
      const student = await seed.student()
      const api = await as(student)

      const empty = await api.post(`${BASE}/resolve-batch`).send({ refs: [] })
      expect(empty.status).toBe(200)
      expect(empty.body.data.items).toEqual([])

      const tooMany = await api
        .post(`${BASE}/resolve-batch`)
        .send({ refs: Array.from({ length: 51 }, (_, i) => `media://aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`) })
      expect(tooMany.status).toBe(400)
      expect(tooMany.body.message).toMatch(/At most 50/i)
    })

    it("applies one disposition/ttl across the whole batch", async () => {
      const student = await seed.student()
      const api = await as(student)
      await api
        .post(`${BASE}/resolve-batch`)
        .send({ refs: [REF_A], disposition: "attachment", expiresInSeconds: "10" })
      expect(signRequests.at(-1)).toMatchObject({
        file_ref: REF_A,
        disposition: "attachment",
        expires_in_seconds: 10,
      })
    })
  })
})
