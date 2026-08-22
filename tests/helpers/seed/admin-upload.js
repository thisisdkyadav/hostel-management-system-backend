/**
 * Test-double storage service for the /api/v1/upload module.
 *
 * The upload module validates intent (role, mime, size) and then delegates
 * storage to the dedicated Go storage service via STORAGE_SERVICE_URL +
 * STORAGE_INTERNAL_API_KEY (see src/services/storage/storage.client.js).
 *
 * In the integration-test environment the real storage service (:5100) is not
 * running, so every happy path would end in a 502. This helper starts a tiny
 * in-process HTTP server that speaks the same internal contract
 * (`POST /internal/v1/files`, meta/sign/content endpoints) and records every
 * upload so tests can assert what the backend actually sent upstream.
 *
 * NOTE (module side effect): STORAGE_SERVICE_URL is overridden HERE, at import
 * time, because dotenv never overrides existing process.env entries. Importing
 * this module FIRST in a test file guarantees env.config.js sees the mock URL.
 */
import http from "node:http"
import crypto from "node:crypto"
import multer from "multer"

const MOCK_PORT = Number(process.env.ITEST_STORAGE_MOCK_PORT || 5155)
export const MOCK_STORAGE_URL = `http://127.0.0.1:${MOCK_PORT}`

const ORIGINAL_STORAGE_URL = process.env.STORAGE_SERVICE_URL
process.env.STORAGE_SERVICE_URL = MOCK_STORAGE_URL

const state = {
  server: null,
  /** Every accepted upload: { fileId, fileRef, policy, actorId, actorRole, entityHint, mimetype, originalName, size } */
  uploads: [],
  /** file_id -> { buffer, contentType } so content/meta endpoints can serve bytes back */
  blobs: new Map(),
  /** Policies the mock should reject with "Unknown upload policy" (for fallback-path tests) */
  denyPolicies: new Set(),
}

export const mockStorage = {
  uploads: state.uploads,
  denyPolicies: state.denyPolicies,
  reset() {
    state.uploads.length = 0
    state.denyPolicies.clear()
    state.blobs.clear()
  },
  async start() {
    if (state.server) return
    await new Promise((resolve) => {
      state.server = http.createServer(handler)
      state.server.listen(MOCK_PORT, "127.0.0.1", resolve)
    })
  },
  async stop() {
    if (!state.server) return
    await new Promise((resolve) => state.server.close(resolve))
    state.server = null
    // Restore whatever .env had so later test files are unaffected.
    process.env.STORAGE_SERVICE_URL = ORIGINAL_STORAGE_URL
  },
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function getInternalKey() {
  const { env } = await import("../../../src/config/env.config.js")
  return env.storage.internalApiKey
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(payload))
}

const parseMultipart = multer({ storage: multer.memoryStorage() }).any()

async function handler(req, res) {
  try {
    const url = new URL(req.url, MOCK_STORAGE_URL)
    const key = await getInternalKey()
    if (req.headers["x-storage-internal-key"] !== key) {
      return json(res, 401, { message: "Invalid storage internal API key" })
    }

    // POST /internal/v1/files — the upload endpoint used by storageClient.upload
    if (req.method === "POST" && url.pathname === "/internal/v1/files") {
      await new Promise((resolve) => parseMultipart(req, res, resolve))
      const body = req.body || {}
      const file = (req.files || [])[0]
      const policy = String(body.policy || "")

      if (state.denyPolicies.has(policy)) {
        return json(res, 400, { message: `Unknown upload policy: ${policy}` })
      }
      if (!file) {
        return json(res, 400, { message: "No file part in request" })
      }

      const fileId = crypto.randomUUID()
      const record = {
        fileId,
        fileRef: `media://${fileId}`,
        policy,
        actorId: String(body.actorId || ""),
        actorRole: String(body.actorRole || ""),
        entityHint: String(body.entityHint || ""),
        sourceService: String(body.sourceService || ""),
        mimetype: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      }
      state.uploads.push(record)
      state.blobs.set(fileId, { buffer: file.buffer, contentType: file.mimetype })

      return json(res, 200, {
        file_id: record.fileId,
        file_ref: record.fileRef,
        url: `/internal/v1/files/${fileId}/content`,
        content_type: record.mimetype,
        size: record.size,
        original_name: record.originalName,
        policy: record.policy,
        actor_id: record.actorId,
        actor_role: record.actorRole,
        entity_hint: record.entityHint,
      })
    }

    // GET /internal/v1/files/:id/meta
    const metaMatch = url.pathname.match(/^\/internal\/v1\/files\/([^/]+)\/meta$/)
    if (req.method === "GET" && metaMatch) {
      const record = state.uploads.find((u) => u.fileId === metaMatch[1])
      if (!record) return json(res, 404, { message: "File not found" })
      return json(res, 200, {
        file_id: record.fileId,
        file_ref: record.fileRef,
        policy: record.policy,
        actor_id: record.actorId,
        actor_role: record.actorRole,
        entity_hint: record.entityHint,
        content_type: record.mimetype,
        size: record.size,
        original_name: record.originalName,
      })
    }

    // GET /internal/v1/files/:id/content
    const contentMatch = url.pathname.match(/^\/internal\/v1\/files\/([^/]+)\/content$/)
    if (req.method === "GET" && contentMatch) {
      const blob = state.blobs.get(contentMatch[1])
      if (!blob) return json(res, 404, { message: "File not found" })
      res.writeHead(200, { "content-type": blob.contentType })
      return res.end(blob.buffer)
    }

    // POST /internal/v1/files/sign
    if (req.method === "POST" && url.pathname === "/internal/v1/files/sign") {
      const raw = await readBody(req)
      let payload = {}
      try {
        payload = JSON.parse(raw.toString("utf8") || "{}")
      } catch {}
      const ref = String(payload.file_ref || "")
      const fileId = ref.replace(/^media:\/\//, "")
      if (!state.blobs.has(fileId)) return json(res, 404, { message: "File not found" })
      return json(res, 200, {
        url: `/internal/v1/files/${fileId}/content`,
        file_id: fileId,
        file_ref: ref,
      })
    }

    return json(res, 404, { message: `Mock storage has no route for ${req.method} ${url.pathname}` })
  } catch (error) {
    return json(res, 500, { message: error.message })
  }
}

export default mockStorage
