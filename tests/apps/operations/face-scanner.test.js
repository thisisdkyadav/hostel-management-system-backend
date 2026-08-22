/**
 * Face Scanner module integration tests.
 *
 * Source: src/apps/operations/modules/face-scanner/
 *
 * Route map (as implemented):
 *   Management (session auth, Admin/Super Admin + route guard):
 *     POST   /api/v1/face-scanner
 *     GET    /api/v1/face-scanner
 *     GET    /api/v1/face-scanner/:id
 *     PUT    /api/v1/face-scanner/:id
 *     DELETE /api/v1/face-scanner/:id
 *     POST   /api/v1/face-scanner/:id/regenerate-password
 *   Device (machine auth via FaceScanner credentials — HTTP Basic OR the
 *   legacy custom header whose NAME is the scanner username and VALUE its
 *   password; NOT an ApiClient key — ApiClient is a separate collection only
 *   managed through super-admin and never consulted by authenticateScanner):
 *     GET  /api/v1/face-scanner/ping
 *     POST /api/v1/face-scanner/scan
 *     GET  /api/v1/face-scanner/test-auth
 *
 * SUSPECTED BUG (documented in the CORS section below): express.loader.js
 * mounts permissive scanner CORS on the NON-/api/v1 paths
 * `/api/face-scanner/{ping,scan,test-auth}`, but no route handler is ever
 * mounted there — the router lives at /api/v1. Those special paths therefore
 * always fall through to the 404 handler.
 */
import { describe, it, expect, beforeAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { initRealtime } from "../../helpers/seed/operations.js"
import { allocateStudent, unallocatedStudent, createHostelWithRoom } from "../../helpers/seed/face-scan.js"

const BASE = "/api/v1/face-scanner"

let admin, studentUser

const basicHeader = (username, password) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`

/** Create a scanner through the admin API; returns { scanner, username, password }. */
async function createScanner(api, body) {
  const res = await api.post(BASE).send(body)
  expect(res.status).toBe(201)
  return {
    scanner: res.body.data.scanner,
    username: res.body.data.credentials.username,
    password: res.body.data.credentials.password,
  }
}

/** Fetch live check-in/out entries as admin (persistence follow-up). */
async function fetchEntries(limit = 200) {
  const api = await as(admin)
  const res = await api.get(`/api/v1/live-checkinout/entries?limit=${limit}`)
  expect(res.status).toBe(200)
  return res.body.data
}

/** Entries populate userId -> object; resolve it back to a comparable id. */
const entryUserId = (entry) => String(entry.userId?._id ?? entry.userId)

beforeAll(async () => {
  await setupTestDb()
  await initRealtime()

  admin = await seed.admin()
  studentUser = await seed.student()
})

// ---------------------------------------------------------------------------
// Management routes (session auth)
// ---------------------------------------------------------------------------
describe("POST /api/v1/face-scanner (create)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.post(BASE).send({ name: "X", type: "hostel-gate", direction: "in" })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for a Student", async () => {
    const api = await as(studentUser)
    const res = await api.post(BASE).send({ name: "X", type: "hostel-gate", direction: "in" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("400 when name/type/direction missing", async () => {
    const api = await as(admin)
    const res = await api.post(BASE).send({ name: "Only Name" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Name, type, and direction are required/)
  })

  it("201 creates a hostel-gate scanner and returns one-time credentials", async () => {
    const { hostel } = await createHostelWithRoom({ hostelName: "FaceScan Hostel" })
    const api = await as(admin)
    const res = await api.post(BASE).send({
      name: "Main Gate In",
      type: "hostel-gate",
      direction: "in",
      hostelId: String(hostel._id),
    })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)

    // Standard envelope shape with one-time credentials
    expect(res.body.data.scanner).toBeTruthy()
    expect(res.body.data.credentials.username).toMatch(/^scanner-/)
    expect(typeof res.body.data.credentials.password).toBe("string")
    expect(res.body.data.credentials.password.length).toBeGreaterThan(10)

    // passwordHash must never leak through the API
    expect(res.body.data.scanner.passwordHash).toBeUndefined()
    expect(res.body.data.scanner.name).toBe("Main Gate In")
    expect(res.body.data.scanner.type).toBe("hostel-gate")
    expect(res.body.data.scanner.direction).toBe("in")
    expect(res.body.data.scanner.isActive).toBe(true)
  })
})

describe("GET /api/v1/face-scanner (list + detail)", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    expect((await api.get(BASE)).status).toBe(401)
  })

  it("403 for a Student", async () => {
    const api = await as(studentUser)
    expect((await api.get(BASE)).status).toBe(403)
  })

  it("200 lists scanners with envelope", async () => {
    const api = await as(admin)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data)).toBe(true)
    expect(res.body.data.length).toBeGreaterThan(0)

    // SUSPECTED BUG (security): the bcrypt passwordHash LEAKS in the admin
    // list response. listScanners() uses .lean(), which bypasses the model's
    // toJSON that deletes passwordHash — so the hash is serialized verbatim.
    // Documenting current behavior; ideally this would be undefined.
    expect(res.body.data[0].passwordHash).toMatch(/^\$2b\$/)
  })

  it("200 filters by type query param", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}?type=hostel-gate`)
    expect(res.status).toBe(200)
    for (const s of res.body.data) expect(s.type).toBe("hostel-gate")
  })

  it("200 returns one scanner by id (populated hostel)", async () => {
    const api = await as(admin)
    const list = await api.get(BASE)
    const id = list.body.data[0]._id ?? list.body.data[0].id

    const res = await api.get(`${BASE}/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(String(res.body.data._id)).toBe(String(id))

    // SUSPECTED BUG (security): same passwordHash leak as the list route —
    // findScannerByIdPopulatedLean() is lean, bypassing the toJSON strip.
    expect(res.body.data.passwordHash).toMatch(/^\$2b\$/)
  })

  it("404 for a well-formed but unknown id", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Scanner not found")
  })

  it("400 for a malformed ObjectId (CastError)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/not-an-objectid`)
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
  })
})

describe("PUT /api/v1/face-scanner/:id (update)", () => {
  it("200 renames a scanner and persists via follow-up GET", async () => {
    const api = await as(admin)
    const created = await createScanner(api, { name: "Rename Me", type: "hostel-gate", direction: "out" })

    const res = await api.put(`${BASE}/${created.scanner._id}`).send({ name: "Renamed Gate" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe("Renamed Gate")

    const get = await api.get(`${BASE}/${created.scanner._id}`)
    expect(get.body.data.name).toBe("Renamed Gate")
  })

  it("404 for an unknown id", async () => {
    const api = await as(admin)
    const res = await api.put(`${BASE}/000000000000000000000000`).send({ name: "Ghost" })
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

describe("DELETE /api/v1/face-scanner/:id", () => {
  it("200 deletes then 404 on re-read", async () => {
    const api = await as(admin)
    const created = await createScanner(api, { name: "Doomed Scanner", type: "hostel-gate", direction: "in" })

    const del = await api.delete(`${BASE}/${created.scanner._id}`)
    expect(del.status).toBe(200)
    expect(del.body.success).toBe(true)

    const get = await api.get(`${BASE}/${created.scanner._id}`)
    expect(get.status).toBe(404)
  })

  it("404 for an unknown id", async () => {
    const api = await as(admin)
    const res = await api.delete(`${BASE}/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

describe("POST /api/v1/face-scanner/:id/regenerate-password", () => {
  let creds

  beforeAll(async () => {
    const api = await as(admin)
    creds = await createScanner(api, { name: "Regen Gate", type: "hostel-gate", direction: "in" })
  })

  it("device auth works with the original password first", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`).set("Authorization", basicHeader(creds.username, creds.password))
    expect(res.status).toBe(200)
    expect(res.body.isSuccess).toBe("Y")
  })

  it("200 returns new one-time credentials and the old password stops working", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/${creds.scanner._id}/regenerate-password`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.credentials.username).toBe(creds.username)
    const newPassword = res.body.data.credentials.password
    expect(newPassword).not.toBe(creds.password)

    const anonApi = await anon()
    const oldAuth = await anonApi
      .get(`${BASE}/ping`)
      .set("Authorization", basicHeader(creds.username, creds.password))
    expect(oldAuth.status).toBe(401)
    expect(oldAuth.body).toEqual({ isSuccess: "N", outputMessage: "Invalid credentials" })

    const newAuth = await anonApi
      .get(`${BASE}/ping`)
      .set("Authorization", basicHeader(creds.username, newPassword))
    expect(newAuth.status).toBe(200)
    expect(newAuth.body.isSuccess).toBe("Y")

    creds.password = newPassword
  })

  it("404 for an unknown id", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/000000000000000000000000/regenerate-password`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Device routes — machine auth (Basic or legacy custom header)
// ---------------------------------------------------------------------------
describe("scanner auth on device routes", () => {
  let creds

  beforeAll(async () => {
    const api = await as(admin)
    creds = await createScanner(api, { name: "Auth Probe Gate", type: "hostel-gate", direction: "in" })
  })

  it("GET /ping 401 without any credentials", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ isSuccess: "N", outputMessage: "Invalid credentials" })
  })

  it("GET /ping 401 with wrong Basic password", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`).set("Authorization", basicHeader(creds.username, "wrong-password"))
    expect(res.status).toBe(401)
    expect(res.body.isSuccess).toBe("N")
  })

  it("GET /ping 401 with unknown Basic username", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`).set("Authorization", basicHeader("nobody-here", "whatever"))
    expect(res.status).toBe(401)
    expect(res.body.isSuccess).toBe("N")
  })

  it("GET /ping 200 with valid Basic auth and reports the scanner", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`).set("Authorization", basicHeader(creds.username, creds.password))
    expect(res.status).toBe(200)
    expect(res.body.isSuccess).toBe("Y")
    expect(res.body.outputMessage).toBe("Scanner connected")
    expect(res.body.scanner.name).toBe("Auth Probe Gate")
    expect(res.body.scanner.type).toBe("hostel-gate")
    expect(res.body.scanner.direction).toBe("in")
    expect(res.body.timestamp).toBeTruthy()
  })

  it("GET /test-auth 200 via the legacy custom header (header NAME = username)", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/test-auth`).set(creds.username.toLowerCase(), creds.password)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Scanner authenticated successfully")
    expect(res.body.scanner.username).toBe(creds.username)
  })

  it("GET /test-auth 401 when neither scheme matches", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/test-auth`).set("some-other-header", "nope")
    expect(res.status).toBe(401)
    expect(res.body.isSuccess).toBe("N")
  })
})

// ---------------------------------------------------------------------------
// POST /scan — native single-punch format
// ---------------------------------------------------------------------------
describe("POST /api/v1/face-scanner/scan payload validation (hostel-gate)", () => {
  let creds

  beforeAll(async () => {
    const api = await as(admin)
    const { hostel } = await createHostelWithRoom({ hostelName: "Scan Validation Hostel" })
    creds = await createScanner(api, {
      name: "Validation Gate",
      type: "hostel-gate",
      direction: "in",
      hostelId: String(hostel._id),
    })
  })

  it("401 keyless", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/scan`).send({})
    expect(res.status).toBe(401)
    expect(res.body.isSuccess).toBe("N")
  })

  const invalidCases = [
    ["missing everything", {}, /deviceID is required/],
    ["missing employeeID", { deviceID: "DEV1", date: "2025-08-04", time: "09:32:00" }, /employeeID is required/],
    ["missing date", { deviceID: "DEV1", employeeID: "22BCS001", time: "09:32:00" }, /date is required/],
    ["missing time", { deviceID: "DEV1", employeeID: "22BCS001", date: "2025-08-04" }, /time is required/],
    [
      "bad date format",
      { deviceID: "DEV1", employeeID: "22BCS001", date: "04-08-2025", time: "09:32:00" },
      /date must be YYYY-MM-DD/,
    ],
    [
      "bad time format",
      { deviceID: "DEV1", employeeID: "22BCS001", date: "2025-08-04", time: "0932" },
      /time must be HH:mm/,
    ],
  ]

  for (const [label, payload, expected] of invalidCases) {
    it(`400 ${label} (device-style error envelope)`, async () => {
      const api = await anon()
      const res = await api.post(`${BASE}/scan`).set("Authorization", basicHeader(creds.username, creds.password)).send(payload)
      expect(res.status).toBe(400)
      expect(res.body.isSuccess).toBe("N")
      expect(res.body.outputMessage).toMatch(expected)
    })
  }

  it("unknown roll number is acknowledged exactly like a real punch (documented behavior)", async () => {
    // SUSPECTED BUG: an unrecognized roll number yields the SAME response as a
    // successful punch — HTTP 200 { isSuccess: "Y", outputMessage:
    // "Added Successfully" } — because the hostel-gate branch hardcodes
    // "Added Successfully" and ignores result.message ("Student not found
    // roll number: ..."). The device cannot tell a hit from a miss.
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        deviceID: "K70798176",
        employeeID: "ZZNOROLL99",
        date: "2025-08-04",
        time: "09:32:00",
        modeofPunch: "Face",
        modeofAttn: "IN",
        ip: "192.168.1.244",
      })
    expect(res.status).toBe(200)
    expect(res.body.isSuccess).toBe("Y")
    expect(res.body.outputMessage).toBe("Added Successfully")
  })

  it("known student WITHOUT room allocation -> 400", async () => {
    await unallocatedStudent({ rollNumber: "22BCS002" })
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        deviceID: "DEV1",
        employeeID: "22BCS002",
        date: "2025-08-04",
        time: "09:32:00",
        modeofAttn: "IN",
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ isSuccess: "N", outputMessage: "Student does not have a room allocation" })
  })

  it("happy path IN scan -> 200 and entry persisted (follow-up GET)", async () => {
    const { user } = await allocateStudent({ rollNumber: "22BCS001", hostelId: creds.scanner.hostelId?._id ?? creds.scanner.hostelId })
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        deviceID: "DEV1",
        deviceSerialno: "DEV1",
        employeeID: "22BCS001",
        date: "2025-08-04",
        time: "09:32:00",
        modeofPunch: "Face",
        modeofAttn: "IN",
        ip: "192.168.1.244",
      })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isSuccess: "Y", outputMessage: "Added Successfully" })

    const entries = await fetchEntries()
    const match = entries.find((e) => entryUserId(e) === String(user._id))
    expect(match).toBeTruthy()
    expect(match.status).toBe("Checked In")
  })

  it("modeofAttn OUT overrides the scanner's configured direction", async () => {
    const { user } = await allocateStudent({ rollNumber: "22BCS003" })
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        deviceID: "DEV1",
        employeeID: "22BCS003",
        date: "2025-08-04",
        time: "18:05:00",
        modeofAttn: "OUT",
      })
    expect(res.status).toBe(200)
    expect(res.body.isSuccess).toBe("Y")

    const entries = await fetchEntries()
    const match = entries.find((e) => entryUserId(e) === String(user._id))
    expect(match?.status).toBe("Checked Out")
  })
})

describe("POST /api/v1/face-scanner/scan dining-meal edge case", () => {
  it("400 when the dining scanner has no caterer linked", async () => {
    const api = await as(admin)
    const creds = await createScanner(api, { name: "Mess Line 1", type: "dining-meal", direction: "in" })

    const anonApi = await anon()
    const res = await anonApi
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        deviceID: "MESS1",
        employeeID: "22BCS001",
        date: "2025-08-04",
        time: "12:30:00",
        modeofAttn: "IN",
      })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ isSuccess: "N", outputMessage: "Dining scanner is not linked to a caterer" })
  })
})

// ---------------------------------------------------------------------------
// POST /scan — Easy TimePro / ZKTeco batch push format
// ---------------------------------------------------------------------------
describe("POST /api/v1/face-scanner/scan Easy TimePro batch push", () => {
  let creds
  let studentIn, studentOut

  beforeAll(async () => {
    const api = await as(admin)
    const { hostel } = await createHostelWithRoom({ hostelName: "EasyTime Hostel" })
    creds = await createScanner(api, {
      name: "EasyTime Gate",
      type: "hostel-gate",
      direction: "in",
      hostelId: String(hostel._id),
    })
    ;({ user: studentIn } = await allocateStudent({ rollNumber: "22ET001", hostelId: hostel._id }))
    ;({ user: studentOut } = await allocateStudent({ rollNumber: "22ET002", hostelId: hostel._id }))
  })

  it("authenticates via Basic auth and acknowledges a mixed batch with 200", async () => {
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send([
        { EMP_CODE: "22ET001", PUNCH_DATETIME: "2025-08-04 09:32:00", PUNCH_STATE: "0", VERIFY_TYPE: "15", TERMINAL_SN: "K70798176" },
        // Invalid record (no EMP_CODE) — skipped silently, batch still succeeds
        { PUNCH_DATETIME: "2025-08-04 09:33:00", PUNCH_STATE: "0", TERMINAL_SN: "K70798176" },
        { EMP_CODE: "22ET002", PUNCH_DATETIME: "2025-08-04T17:45:00", PUNCH_STATE: "1", VERIFY_TYPE: "15", TERMINAL_SN: "K70798176" },
      ])

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      status: "success",
      code: 200,
      message: "Attendance data processed successfully",
    })
  })

  it("valid punches were recorded with mapped IN/OUT states (follow-up GET)", async () => {
    const entries = await fetchEntries()

    const etIn = entries.find((e) => entryUserId(e) === String(studentIn._id))
    expect(etIn?.status).toBe("Checked In")

    const etOut = entries.find((e) => entryUserId(e) === String(studentOut._id))
    expect(etOut?.status).toBe("Checked Out")
  })

  it("single Easy TimePro-keyed object (not array) is accepted too", async () => {
    const api = await anon()
    const res = await api
      .post(`${BASE}/scan`)
      .set("Authorization", basicHeader(creds.username, creds.password))
      .send({
        EMP_CODE: "22ET001",
        PUNCH_DATETIME: "2025-08-04 20:00:00",
        PUNCH_STATE: "1",
        VERIFY_TYPE: "15",
        TERMINAL_SN: "K70798176",
      })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("success")
  })
})

// ---------------------------------------------------------------------------
// Special CORS wiring (/api/face-scanner/* vs /api/v1/face-scanner/*)
// ---------------------------------------------------------------------------

// SUSPECTED BUG: express.loader.js attaches permissive scanner CORS to the
// non-/api/v1 paths `/api/face-scanner/ping|scan|test-auth`, but NO handler is
// mounted at those paths (the face-scanner router lives under operationsApp at
// /api/v1). Every real request to them falls through to the global 404
// handler. The tests below document that current behavior while still
// asserting that ONLY those paths reflect Origin: * with credentials disabled.
describe("special scanner CORS wiring", () => {
  const EVIL_ORIGIN = "https://evil.example"

  it("OPTIONS preflight on the special path gets 204 with Origin: * and no credentials", async () => {
    const api = await anon()
    const res = await api.raw.options("/api/face-scanner/ping").set("Origin", EVIL_ORIGIN).set("Access-Control-Request-Method", "GET")

    expect(res.status).toBe(204)
    expect(res.headers["access-control-allow-origin"]).toBe("*")
    expect(res.headers["access-control-allow-methods"]).toMatch(/GET/)
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/)
    expect(res.headers["access-control-allow-headers"]).toMatch(/Content-Type/)
    expect(res.headers["access-control-allow-headers"]).toMatch(/Authorization/)
    // Preflight is answered entirely by the scanner cors() (credentials:false)
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined()
  })

  it("SUSPECTED BUG: real request to /api/face-scanner/ping is 404 (no handler mounted), though scanner CORS headers still apply", async () => {
    const api = await anon()
    const res = await api.get("/api/face-scanner/ping").set("Origin", EVIL_ORIGIN)

    // Documenting current behavior: route not reachable at the advertised path
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/not found/i)

    // The special CORS middleware still ran for this exact path (Origin: *
    // reflected). Note: because the request then falls through to the regular
    // cors(), Access-Control-Allow-Credentials: true is ALSO stamped onto
    // non-preflight responses — partially defeating credentials:false here.
    expect(res.headers["access-control-allow-origin"]).toBe("*")
    expect(res.headers["access-control-allow-credentials"]).toBe("true")
  })

  it("same 404 applies to /api/face-scanner/scan and /api/face-scanner/test-auth", async () => {
    const api = await anon()
    const scan = await api.post("/api/face-scanner/scan").set("Origin", EVIL_ORIGIN).send({})
    const testAuth = await api.get("/api/face-scanner/test-auth").set("Origin", EVIL_ORIGIN)

    expect(scan.status).toBe(404)
    expect(scan.headers["access-control-allow-origin"]).toBe("*")
    expect(testAuth.status).toBe(404)
    expect(testAuth.headers["access-control-allow-origin"]).toBe("*")
  })

  it("the working /api/v1 device routes do NOT get Origin: * (regular CORS allowlist)", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/ping`).set("Origin", EVIL_ORIGIN)

    // Regular cors() uses env.ALLOWED_ORIGINS (empty in tests) — no reflection
    expect(res.headers["access-control-allow-origin"]).toBeUndefined()
    // The device still got the machine-auth rejection from the real route
    expect(res.status).toBe(401)
    expect(res.body.isSuccess).toBe("N")
  })
})
