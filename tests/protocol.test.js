/**
 * Cross-cutting HTTP protocol & envelope integration tests.
 *
 * Unlike the per-module suites under apps/, this file probes how the Express
 * app behaves at the PROTOCOL level across many areas at once: method
 * mismatches, trailing/double slashes, body-parser edge cases, query-string
 * quirks, content negotiation, garbage session cookies, CORS reflection and
 * the exact notFoundHandler shape.
 *
 * Every assertion below matches OBSERVED behavior of the real app (probed via
 * supertest against src/app.js). Where the observed behavior is questionable,
 * the test pins it and carries a `// SUSPECTED BUG:` comment — do not "fix"
 * the expectation silently; fix the app or move the comment with it.
 *
 * Run: cd backend/tests && ITEST_NS=x_proto npx vitest run protocol.test.js
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"

// ─── Env must be set BEFORE any import of the app/env.config chain ───────────
// dotenv loads from process.cwd() (backend/tests), which has no .env, so
// ALLOWED_ORIGINS would otherwise be [] and CORS assertions meaningless.
process.env.ALLOWED_ORIGINS = "http://localhost:5173,https://trusted.example"

// Dynamic imports so the env assignment above lands first (ESM hoists statics).
const [{ setupTestDb, teardownTestDb }, { as, anon }, { seed }] = await Promise.all([
  import("./helpers/db.js"),
  import("./helpers/http.js"),
  import("./helpers/seed.js"),
])

let adminApi // authenticated Admin client
let studentApi // authenticated Student client

beforeAll(async () => {
  await setupTestDb()
  const admin = await seed.admin({ name: "Proto Admin" })
  const student = await seed.student()
  adminApi = await as(admin)
  studentApi = await as(student)
})

afterAll(async () => {
  await teardownTestDb()
})

// The exact JSON shape produced by core/errors/errorHandler.notFoundHandler
const expectNotFoundEnvelope = (res, method, url) => {
  expect(res.status).toBe(404)
  expect(res.headers["content-type"]).toMatch(/application\/json/)
  expect(res.body.success).toBe(false)
  expect(res.body.message).toBe(`Route ${method} ${url} not found`)
  expect(typeof res.body.timestamp).toBe("string")
  expect(new Date(res.body.timestamp).toString()).not.toBe("Invalid Date")
  // No Allow header anywhere — the app never emits 405 responses
  expect(res.headers.allow).toBeUndefined()
}

describe("root & unknown paths — notFoundHandler exact shape", () => {
  it("GET / serves the plain-text hello page", async () => {
    const app = (await anon()).raw
    const res = await app.get("/")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/text\/html/)
    expect(res.text).toBe("Hello World!!")
  })

  it("GET /health returns { status:'ok', timestamp } without auth", async () => {
    const app = (await anon()).raw
    const res = await app.get("/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(typeof res.body.timestamp).toBe("string")
  })

  it("GET unknown /api/v1/<unknown> returns the exact 404 envelope", async () => {
    const res = await adminApi.get("/api/v1/definitely-not-a-route")
    expectNotFoundEnvelope(res, "GET", "/api/v1/definitely-not-a-route")
  })

  it("404 message echoes originalUrl including the query string", async () => {
    const res = await adminApi.get("/api/v1/nope?page=1&x=y")
    expectNotFoundEnvelope(res, "GET", "/api/v1/nope?page=1&x=y")
    expect(res.body.message).toContain("?page=1&x=y")
  })

  it("PUT / (method mismatch on root) -> 404 envelope, not 405", async () => {
    const res = await adminApi.put("/")
    expectNotFoundEnvelope(res, "PUT", "/")
  })

  it("DELETE /health -> 404 envelope", async () => {
    const res = await anon().then((a) => a.delete("/health"))
    expectNotFoundEnvelope(res, "DELETE", "/health")
  })
})

describe("method mismatches — app answers 404, never 405", () => {
  it("GET /api/v1/tasks (route is POST-only) -> 404 envelope", async () => {
    const res = await adminApi.get("/api/v1/tasks")
    expectNotFoundEnvelope(res, "GET", "/api/v1/tasks")
  })

  it("POST /api/v1/dashboard (GET-only) -> 404 envelope", async () => {
    const res = await adminApi.post("/api/v1/dashboard").send({})
    expectNotFoundEnvelope(res, "POST", "/api/v1/dashboard")
  })

  it("PUT /api/v1/users/search (GET-only) -> 404 envelope", async () => {
    const res = await adminApi.put("/api/v1/users/search").send({})
    expectNotFoundEnvelope(res, "PUT", "/api/v1/users/search")
  })

  it("PATCH /api/v1/inventory/types (GET/POST route) -> 404 envelope", async () => {
    const res = await adminApi.patch("/api/v1/inventory/types").send({})
    expectNotFoundEnvelope(res, "PATCH", "/api/v1/inventory/types")
  })

  it("POST /api/v1/notification/stats (GET-only) -> 404 envelope", async () => {
    const res = await studentApi.post("/api/v1/notification/stats").send({})
    expectNotFoundEnvelope(res, "POST", "/api/v1/notification/stats")
  })

  it("GET /api/v1/complaint (no root GET handler on complaints mount) -> 404 envelope", async () => {
    const res = await studentApi.get("/api/v1/complaint")
    expectNotFoundEnvelope(res, "GET", "/api/v1/complaint")
  })

  it("SUSPECTED BUG: DELETE /api/v1/tasks/all escapes the static-path mismatch and hits DELETE /:id with id='all' -> 500 raw non-envelope body", async () => {
    // Observed: the parametric route swallows the mismatch, the service fails
    // to delete, and the controller replies with its legacy raw format
    // ({ message } only) and a 500 — instead of 404/405 + envelope.
    const res = await adminApi.delete("/api/v1/tasks/all")
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ message: "Failed to delete Task" })
    expect(res.body.success).toBeUndefined()
  })
})

describe("trailing slashes & path quirks (Express 5)", () => {
  it("trailing slash is tolerated: GET /api/v1/dashboard/ == /api/v1/dashboard -> 200", async () => {
    const plain = await adminApi.get("/api/v1/dashboard")
    const slashed = await adminApi.get("/api/v1/dashboard/")
    expect(slashed.status).toBe(200)
    expect(slashed.body).toEqual(plain.body)
  })

  it("trailing slash on sub-router root: GET /api/v1/notification/ -> 200", async () => {
    const res = await studentApi.get("/api/v1/notification/")
    expect(res.status).toBe(200)
    expect(res.body.meta.currentPage).toBe(1)
  })

  it("trailing slash on /health/ -> 200 ok", async () => {
    const res = await anon().then((a) => a.get("/health/"))
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
  })

  it("POST /api/v1/inventory/types/ still reaches the controller (400 Name required)", async () => {
    const res = await adminApi.post("/api/v1/inventory/types").set("Content-Type", "application/json").send("{}")
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Name is required")
  })

  it("double slashes never match: //api/v1//tasks -> 404 envelope with verbatim url", async () => {
    const res = await adminApi.get("//api/v1//tasks")
    expectNotFoundEnvelope(res, "GET", "//api/v1//tasks")
  })

  it("mixed double slashes + trailing slash -> 404 envelope", async () => {
    const res = await adminApi.get("/api//v1//tasks/all/")
    expectNotFoundEnvelope(res, "GET", "/api//v1//tasks/all/")
  })

  it("percent-encoded path segment (%74asks) does NOT match /tasks -> 404", async () => {
    // Observed: Express 5 does not decode-and-match here; pinned as-is.
    const res = await adminApi.get("/api/v1/%74asks/all")
    expectNotFoundEnvelope(res, "GET", "/api/v1/%74asks/all")
  })

  it("routing is case-insensitive: /API/V1/TASKS/ALL -> 200", async () => {
    const res = await adminApi.get("/API/V1/TASKS/ALL")
    expect(res.status).toBe(200)
    expect(res.body.tasks).toEqual([])
    expect(res.body.pagination.perPage).toBe(12)
  })

  it("dot segments are normalized by the HTTP client before routing (/api/v1/tasks/../tasks/all -> 200)", async () => {
    // Note: normalization happens in node's http layer, not in Express —
    // Express only ever sees the resolved path. Pinned end-to-end anyway.
    const res = await adminApi.get("/api/v1/tasks/../tasks/all")
    expect(res.status).toBe(200)
    expect(res.body.pagination).toBeDefined()
  })
})

describe("request body handling", () => {
  it("SUSPECTED BUG: malformed JSON -> 500 (not 400) with dev stack trace leaked in the envelope", async () => {
    // body-parser sets err.status=400 but errorHandler doesn't honor it and
    // falls into the unknown-error branch; NODE_ENV=development then leaks
    // err.message AND err.stack.
    const res = await adminApi.post("/api/v1/tasks").set("Content-Type", "application/json").send('{"broken":')
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Unexpected end of JSON input")
    expect(typeof res.body.stack).toBe("string") // stack leaked (dev mode)
    expect(res.body.timestamp).toBeDefined()
  })

  it("empty body with application/json content-type parses to {} -> service 400 validation", async () => {
    const res = await adminApi.post("/api/v1/tasks").set("Content-Type", "application/json").send("")
    expect(res.status).toBe(400)
    // SUSPECTED BUG (envelope inconsistency): error is the legacy raw shape
    // { message } rather than the standard { success:false, ... } envelope.
    expect(res.body).toEqual({ message: "Title, description, and due date are required" })
  })

  it("SUSPECTED BUG: POST with no Content-Type and no body -> req.body undefined -> 500 TypeError destructure", async () => {
    const res = await adminApi.post("/api/v1/tasks")
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain("Cannot destructure property 'title'")
    expect(typeof res.body.stack).toBe("string") // stack leaked (dev mode)
  })

  it("SUSPECTED BUG: valid JSON sent as text/plain is never parsed -> req.body undefined -> 500 TypeError", async () => {
    const payload = JSON.stringify({ title: "T", description: "D", dueDate: new Date().toISOString() })
    const res = await adminApi.post("/api/v1/tasks").set("Content-Type", "text/plain").send(payload)
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain("Cannot destructure property 'title'")
  })

  it("SUSPECTED BUG: oversized JSON (> express.json 1mb limit) -> 500 'request entity too large', not 413", async () => {
    // PayloadTooLargeError carries statusCode 413 but errorHandler ignores it.
    const res = await adminApi
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send({ title: "x".repeat(1100 * 1024), description: "d", dueDate: new Date().toISOString() })
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("request entity too large")
  })

  it("deeply nested JSON (~60 levels) parses fine and fails downstream validation instead", async () => {
    let deep = { title: "t", description: "d", dueDate: new Date().toISOString() }
    for (let i = 0; i < 60; i++) deep = { wrapper: deep }
    const res = await adminApi.post("/api/v1/tasks").set("Content-Type", "application/json").send(deep)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Title, description, and due date are required")
  })

  it("top-level JSON array where an object is expected -> destructured fields are undefined -> 400 validation", async () => {
    const res = await adminApi
      .post("/api/v1/tasks")
      .set("Content-Type", "application/json")
      .send([{ title: "t", description: "d", dueDate: new Date().toISOString() }])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Title, description, and due date are required")
  })
})

describe("query-string handling", () => {
  it("users/search ignores unknown extra params entirely -> 200", async () => {
    const res = await adminApi.get("/api/v1/users/search?query=proto&zzz=1&foo=bar&role=Bogus")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("users/search with empty value ?query= -> 400 raw { message } (legacy shape)", async () => {
    const res = await adminApi.get("/api/v1/users/search?query=")
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: "Search query is required" })
  })

  it("duplicate params (?page=1&page=2) on users/search are tolerated -> 200", async () => {
    // express's extended query parser yields page=["1","2"]; searchUsers
    // never reads `page`, so the array is simply ignored.
    const res = await adminApi.get("/api/v1/users/search?query=proto&page=1&page=2")
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
  })

  it("non-numeric pagination ?page=abc on tasks/all -> 400 raw { message }", async () => {
    const res = await adminApi.get("/api/v1/tasks/all?page=abc")
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: "Invalid pagination parameters" })
  })

  it("duplicate ?page=1&page=2 on tasks/all silently tolerated -> 200 with defaults", async () => {
    const res = await adminApi.get("/api/v1/tasks/all?page=1&page=2")
    expect(res.status).toBe(200)
    expect(res.body.pagination.currentPage).toBe(1)
  })

  it("unknown params alongside valid ones on tasks/all are ignored -> 200", async () => {
    const res = await adminApi.get("/api/v1/tasks/all?page=1&bogus=9&another=x")
    expect(res.status).toBe(200)
    expect(res.body.tasks).toEqual([])
  })

  it("valueless params (?page=&limit=) on notification fall back to defaults -> 200", async () => {
    const res = await studentApi.get("/api/v1/notification?page=&limit=")
    expect(res.status).toBe(200)
    expect(res.body.meta.currentPage).toBe(1)
  })
})

describe("content negotiation", () => {
  it("Accept: text/html on /health is ignored — always application/json", async () => {
    const res = await anon().then((a) => a.get("/health").set("Accept", "text/html"))
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
    expect(JSON.parse(res.text).status).toBe("ok")
  })

  it("Accept: application/xml on /api/v1/notification is ignored — still JSON", async () => {
    const res = await studentApi.get("/api/v1/notification").set("Accept", "application/xml")
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toMatch(/^application\/json/)
  })

  it("odd request charset (iso-8859-1 Content-Type on GET) is harmless; responses are always utf-8", async () => {
    const res = await anon().then((a) => a.get("/health").set("Content-Type", "application/json; charset=iso-8859-1"))
    expect(res.status).toBe(200)
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8")
  })
})

describe("cookie / session protocol robustness", () => {
  const getMyTasksWithCookies = async (cookieHeader) => {
    const app = (await anon()).raw
    return cookieHeader ? app.get("/api/v1/tasks/my-tasks").set("Cookie", cookieHeader) : app.get("/api/v1/tasks/my-tasks")
  }

  const expectAuthRequired = (res) => {
    expect(res.status).toBe(401) // never 500
    expect(res.body).toMatchObject({ success: false, message: "Authentication required" })
    expect(res.headers["content-type"]).toMatch(/application\/json/)
  }

  it("baseline: no cookie at all -> 401", async () => {
    expectAuthRequired(await getMyTasksWithCookies(null))
  })

  it("garbage signed connect.sid cookie -> 401, not 500", async () => {
    expectAuthRequired(await getMyTasksWithCookies("connect.sid=s%3Agarbage.aW52YWxpZHNpZ25hdHVyZQ"))
  })

  it("expired-format session cookie (well-formed sig for an unknown sid) -> 401", async () => {
    expectAuthRequired(
      await getMyTasksWithCookies(
        "connect.sid=s%3Adeadbeef0000000000000000000000000000000.9k8j7h6g5f4d3s2a1q0w9e8r7t6y5u4i3o2p1a",
      ),
    )
  })

  it("cookie header mixing unrelated cookies with connect.sid=s:garbage.sig (unencoded) -> 401", async () => {
    expectAuthRequired(
      await getMyTasksWithCookies("theme=dark; consent=1; connect.sid=s:garbage.sig; other=x"),
    )
  })

  it("unsigned plain connect.sid value -> 401", async () => {
    expectAuthRequired(await getMyTasksWithCookies("connect.sid=plainunsignedsid123"))
  })
})

describe("response headers & CORS", () => {
  it("X-Powered-By: Express is present — app never disables it", async () => {
    // SUSPECTED BUG (hardening nit): fingerprinting header left enabled.
    const res = await anon().then((a) => a.get("/health"))
    expect(res.headers["x-powered-by"]).toBe("Express")
  })

  it("envelope responses are served as application/json; charset=utf-8", async () => {
    const res = await adminApi.get("/api/v1/dashboard")
    expect(res.headers["content-type"]).toBe("application/json; charset=utf-8")
    expect(res.body.success).toBe(true)
  })

  const getNotificationWith = async (headers = {}) => {
    const app = (await anon()).raw
    let req = app.get("/api/v1/notification")
    for (const [k, v] of Object.entries(headers)) req = req.set(k, v)
    if (studentApi.cookie) req = req.set("Cookie", studentApi.cookie)
    return req
  }

  it("credentials route reflects ALLOWED_ORIGINS member http://localhost:5173 (ACAO + ACAC)", async () => {
    const res = await getNotificationWith({ Origin: "http://localhost:5173" })
    expect(res.status).toBe(200)
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173")
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })

  it("foreign origin https://evil.example gets NO ACAO on credentials routes...", async () => {
    const res = await getNotificationWith({ Origin: "https://evil.example" })
    expect(res.status).toBe(200) // request still processed server-side
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("...but ACAC:true leaks even on foreign-origin responses (SUSPECTED BUG)", async () => {
    // cors() sets Access-Control-Allow-Credentials unconditionally when
    // credentials:true, even when the origin was rejected — a confusing
    // combination for browsers/proxies.
    const res = await getNotificationWith({ Origin: "https://evil.example" })
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })

  it("preflight from an allowed origin -> 204 with reflected ACAO + method list", async () => {
    const app = (await anon()).raw
    const res = await app
      .options("/api/v1/notification")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET")
    expect(res.status).toBe(204)
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173")
    expect(res.headers["access-control-allow-methods"]).toBe("GET,HEAD,PUT,PATCH,POST,DELETE")
  })

  it("SUSPECTED BUG: preflight from a DISALLOWED origin also succeeds with 204 (just without ACAO)", async () => {
    // The cors middleware short-circuits ALL OPTIONS requests before routing;
    // disallowed origins get an identical 204 minus the ACAO header, instead
    // of a failed preflight.
    const app = (await anon()).raw
    const res = await app
      .options("/api/v1/notification")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET")
    expect(res.status).toBe(204)
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })

  it("scanner CORS routes reflect '*' to ANY origin — including evil.example", async () => {
    const app = (await anon()).raw
    const res = await app.get("/api/face-scanner/ping").set("Origin", "https://evil.example")
    // Legacy /api/face-scanner/* paths have no routes anymore (module moved to
    // /api/v1/face-scanner), yet the wildcard CORS headers still attach to the
    // 404 response.
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Route GET /api/face-scanner/ping not found")
    expect(res.headers["access-control-allow-origin"]).toBe("*")
  })

  it("requests without Origin header get no ACAO at all", async () => {
    const res = await getNotificationWith({})
    expect(res.status).toBe(200)
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
  })
})
