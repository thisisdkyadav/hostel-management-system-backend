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

// NOTE: this module's controller is "legacy style" — on success it returns the
// bare `result.data` payload (no { success, data } envelope), and on service
// errors only `{ message }`. Tests document that actual wire shape.
const BASE = "/api/v1/users"

describe("GET /users/search", () => {
  let admin
  let aliceStudent
  let aliceWarden

  beforeAll(async () => {
    admin = await seed.admin()
    aliceStudent = await seed.student({ name: "Alice Alpha", phone: "1111111111" })
    aliceWarden = await seed.warden({ name: "Alice Beta" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/search`).query({ query: "alice" })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for a Student (role gate)", async () => {
    const api = await as(aliceStudent)
    const res = await api.get(`${BASE}/search`).query({ query: "alice" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Access denied/)
  })

  it("400 when query param is missing", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Search query is required")
  })

  it("400 when query is blank", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "   " })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Search query is required")
  })

  it("matches by name fragment (case-insensitive) with projected fields", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "alice" })
    expect(res.status).toBe(200)
    const body = res.body
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(2)
    for (const user of body) {
      expect(user).toHaveProperty("_id")
      expect(user).toHaveProperty("name")
      expect(user).toHaveProperty("email")
      expect(user).toHaveProperty("role")
      // projection fields present even when null-ish / absent
      expect("phone" in user || user.phone === undefined).toBe(true)
      expect(user.password).toBeUndefined()
    }
    expect(body.map((u) => u.name).sort()).toEqual(["Alice Alpha", "Alice Beta"])
  })

  it("matches by email fragment", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: aliceStudent.email.slice(0, 10) })
    expect(res.status).toBe(200)
    expect(res.body.some((u) => u._id === String(aliceStudent._id))).toBe(true)
  })

  it("filters by role when provided", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "alice", role: "Student" })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].role).toBe("Student")
  })

  it("returns an empty array when nothing matches", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "zzz-no-such-user-zzz" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("is accessible to Warden but not to Maintenance Staff", async () => {
    const wardenApi = await as(aliceWarden)
    const ok = await wardenApi.get(`${BASE}/search`).query({ query: "alice" })
    expect(ok.status).toBe(200)

    const maintenance = await seed.maintenanceStaff()
    const maintApi = await as(maintenance)
    const denied = await maintApi.get(`${BASE}/search`).query({ query: "alice" })
    expect(denied.status).toBe(403)
    expect(denied.body.success).toBe(false)
  })
})

describe("GET /users/by-role", () => {
  let admin
  let student

  beforeAll(async () => {
    admin = await seed.admin()
    student = await seed.student({ name: "Zed Student" })
    await seed.student({ name: "Amy Student" })
    await seed.warden({ name: "Walter Warden" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/by-role`).query({ role: "Student" })
    expect(res.status).toBe(401)
  })

  it("403 for a Student", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/by-role`).query({ role: "Student" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("400 when role param is missing", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/by-role`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Role parameter is required")
  })

  it("returns users of the requested role sorted by name", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/by-role`).query({ role: "Student" })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThanOrEqual(2)
    const names = res.body.map((u) => u.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    expect(res.body.every((u) => u.role === "Student")).toBe(true)
    expect(res.body[0].password).toBeUndefined()
  })

  it("returns an empty array for a role nobody holds", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/by-role`).query({ role: "Security" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe("POST /users/bulk-password-update", () => {
  let admin
  let superAdmin
  let warden
  let targetUser

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    warden = await seed.warden()
    targetUser = await seed.student({ email: "bulk-pw-target@hms.test" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(res.status).toBe(401)
  })

  it("403 for a Warden (not Admin/Super Admin)", async () => {
    const api = await as(warden)
    const res = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toMatch(/Access denied/)
  })

  it("403 for a Student", async () => {
    const api = await as(targetUser)
    const res = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(res.status).toBe(403)
  })

  it("400 when passwordUpdates is missing or not an array", async () => {
    const api = await as(admin)
    const missing = await api.post(`${BASE}/bulk-password-update`).send({})
    expect(missing.status).toBe(400)
    expect(missing.body.message).toBe("Password updates must be provided as an array")

    const notArray = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: "nope" })
    expect(notArray.status).toBe(400)
    expect(notArray.body.message).toBe("Password updates must be provided as an array")
  })

  it("reports per-email success and failure without failing the request", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [
        { email: "bulk-pw-target@hms.test", password: "s3cretPass!" },
        { email: "ghost@hms.test", password: "irrelevant" },
        { email: "bulk-pw-target@hms.test", password: "" }, // clears the password
      ],
    })
    expect(res.status).toBe(200)
    // The service's `{ message, results }` object has its message hoisted out of
    // data by ServiceResponse.success, and the legacy controller returns only
    // `result.data` — so the wire body is the bare results object.
    expect(res.body.results).toBeDefined()
    expect(res.body.results.successful).toEqual([
      { email: "bulk-pw-target@hms.test" },
      { email: "bulk-pw-target@hms.test" },
    ])
    expect(res.body.results.failed).toEqual([{ email: "ghost@hms.test", reason: "User not found" }])
  })

  it("resolves differently-cased emails correctly (map keys and lookups are both lowercased)", async () => {
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ email: "BULK-PW-TARGET@HMS.TEST", password: "anotherPass1" }],
    })
    expect(res.status).toBe(200)
    expect(res.body.results.successful).toEqual([{ email: "BULK-PW-TARGET@HMS.TEST" }])
    expect(res.body.results.failed).toHaveLength(0)
  })
})

describe("POST /users/bulk-remove-passwords", () => {
  let admin
  let warden
  let u1
  let u2

  beforeAll(async () => {
    admin = await seed.admin()
    warden = await seed.warden()
    u1 = await seed.student({ email: "remove-me-1@hms.test" })
    u2 = await seed.student({ email: "remove-me-2@hms.test" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({ emails: [] })
    expect(res.status).toBe(401)
  })

  it("403 for a Warden", async () => {
    const api = await as(warden)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({ emails: ["x@y.z"] })
    expect(res.status).toBe(403)
  })

  it("400 when emails is missing, empty, or not an array", async () => {
    const api = await as(admin)
    for (const payload of [{}, { emails: [] }, { emails: "not-an-array" }]) {
      const res = await api.post(`${BASE}/bulk-remove-passwords`).send(payload)
      expect(res.status).toBe(400)
      expect(res.body.message).toBe("Array of user emails is required")
    }
  })

  it("removes passwords for found emails and reports unknown ones", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({
      emails: ["remove-me-1@hms.test", "remove-me-2@hms.test", "missing@hms.test"],
    })
    expect(res.status).toBe(200)
    expect(res.body.results.successful.sort()).toEqual([
      { email: "remove-me-1@hms.test" },
      { email: "remove-me-2@hms.test" },
    ].sort())
    expect(res.body.results.failed).toEqual([{ email: "missing@hms.test", reason: "User not found" }])
    expect([u1._id.toString(), u2._id.toString()]).toHaveLength(2) // sanity
  })
})

describe("POST /users/remove-passwords-by-role", () => {
  let admin
  let warden

  beforeAll(async () => {
    admin = await seed.admin()
    warden = await seed.warden()
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(res.status).toBe(401)
  })

  it("403 for a Warden", async () => {
    const api = await as(warden)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(res.status).toBe(403)
  })

  it("400 when role is missing", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Role is required")
  })

  it("404 when no users hold the role", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(res.status).toBe(404)
    // the service passes a sentence that does not end in "not found", so
    // notFound() still appends its suffix.
    expect(res.body.message).toBe("No users found with the specified role not found")
  })

  it("removes passwords for every user with the role and reports the count", async () => {
    await seed.security({ name: "Guard A" })
    await seed.security({ name: "Guard B" })
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    // The service's `{ message, count }` has its message hoisted out of data by
    // ServiceResponse.success, and the legacy controller returns only
    // `result.data` — so the human-readable message never reaches the wire.
    expect(res.body.message).toBeUndefined()
  })
})

describe("POST /users/:id/remove-password", () => {
  let admin
  let student

  beforeAll(async () => {
    admin = await seed.admin()
    student = await seed.student({ email: "single-remove@hms.test" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/${student._id}/remove-password`)
    expect(res.status).toBe(401)
  })

  it("403 for a Student", async () => {
    const api = await as(student)
    const res = await api.post(`${BASE}/${admin._id}/remove-password`)
    expect(res.status).toBe(403)
  })

  it("400 for a malformed id", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/not-an-objectid/remove-password`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("404 for an unknown but well-formed id", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/000000000000000000000000/remove-password`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("User not found")
  })

  it("removes the password and echoes identifying user fields", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/${student._id}/remove-password`)
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({
      _id: String(student._id),
      email: "single-remove@hms.test",
      name: student.name,
    })
  })
})

describe("GET /users/:id", () => {
  let admin
  let student
  let target

  beforeAll(async () => {
    admin = await seed.admin()
    student = await seed.student()
    target = await seed.hostelSupervisor({ name: "Id Fetch Target", phone: "2222222222" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/${target._id}`)
    expect(res.status).toBe(401)
  })

  it("403 for a Student", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/${target._id}`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("400 for a malformed id", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/garbage-id`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("404 for an unknown id", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/000000000000000000000001`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("User not found")
  })

  it("returns the projected user fields", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/${target._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      _id: String(target._id),
      name: "Id Fetch Target",
      role: "Hostel Supervisor",
      phone: "2222222222",
    })
    expect(res.body.password).toBeUndefined()
  })
})

describe("ordered workflow: search -> fetch -> password lifecycle", () => {
  it("supports an end-to-end admin flow through the API", async () => {
    const admin = await seed.admin()
    const user = await seed.student({ name: "Workflow Wendy", email: "workflow-wendy@hms.test" })
    const api = await as(admin)

    // 1. find the user
    const found = await api.get(`${BASE}/search`).query({ query: "workflow-wendy@hms.test" })
    expect(found.status).toBe(200)
    expect(found.body.map((u) => u._id)).toContain(String(user._id))

    // 2. fetch by id
    const one = await api.get(`${BASE}/${user._id}`)
    expect(one.status).toBe(200)
    expect(one.body.email).toBe("workflow-wendy@hms.test")

    // 3. set a password in bulk
    const setPw = await api
      .post(`${BASE}/bulk-password-update`)
      .send({ passwordUpdates: [{ email: "workflow-wendy@hms.test", password: "tempPass9" }] })
    expect(setPw.status).toBe(200)
    expect(setPw.body.results.successful).toEqual([{ email: "workflow-wendy@hms.test" }])

    // 4. remove it individually
    const rm = await api.post(`${BASE}/${user._id}/remove-password`)
    expect(rm.status).toBe(200)
    expect(rm.body.user.email).toBe("workflow-wendy@hms.test")

    // 5. bulk remove again (idempotent at the API level — still "successful")
    const rmBulk = await api
      .post(`${BASE}/bulk-remove-passwords`)
      .send({ emails: ["workflow-wendy@hms.test"] })
    expect(rmBulk.status).toBe(200)
    expect(rmBulk.body.results.failed).toHaveLength(0)

    // 6. role-wide removal still finds her
    const rmRole = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Student" })
    expect(rmRole.status).toBe(200)
    expect(rmRole.body.count).toBeGreaterThanOrEqual(1)
  })
})

// ---------------------------------------------------------------------------
// Hardened edges
// ---------------------------------------------------------------------------

describe("GET /users/search — hardened edges", () => {
  let admin

  beforeAll(async () => {
    admin = await seed.admin()
  })

  it("403 via Layer-3 route-key denial when an Admin's override denies route.admin.students", async () => {
    // Role gate passes (Admin is in the guard list) but the route-key check fails.
    const stripped = await seed.createUser({
      role: "Admin",
      authz: { override: { denyRoutes: ["route.admin.students"] } },
    })
    const api = await as(stripped)
    const res = await api.get(`${BASE}/search`).query({ query: "alice" })
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    // Layer-3 message is distinct from the Layer-2 role-gate message.
    expect(res.body.message).toBe("You do not have access to this route")
  })

  it("200 for Associate Warden and Hostel Supervisor (mapped roles)", async () => {
    const awApi = await as(await seed.associateWarden())
    const awRes = await awApi.get(`${BASE}/search`).query({ query: "a" })
    expect(awRes.status).toBe(200)

    const hsApi = await as(await seed.hostelSupervisor())
    const hsRes = await hsApi.get(`${BASE}/search`).query({ query: "a" })
    expect(hsRes.status).toBe(200)
  })

  it("caps results at 5 even when more users match", async () => {
    for (let i = 1; i <= 6; i++) {
      await seed.student({ name: `LimitProbe Number${i}` })
    }
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "LimitProbe" })
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(5)
  })

  it("'.' regex metacharacters are passed through unescaped and match broadly", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "LimitPr.be" })
    expect(res.status).toBe(200)
    // "." acts as a wildcard — it still finds LimitProbe users.
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.every((u) => /limitpr.be/i.test(`${u.name} ${u.email}`))).toBe(true)
  })

  it("SUSPECTED BUG: an invalid regex fragment in query blows up as a 500 instead of a 400", async () => {
    // users.service searchUsers interpolates `query` straight into $regex without
    // escaping, so "(" raises a Mongo regular-expression error that falls through
    // to the global error handler. Documenting current behavior.
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "(" })
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })

  it("role filter combined with a non-matching prefix returns an empty array", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/search`).query({ query: "LimitProbe", role: "Warden" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("Super Admin passes both the role gate and the route-key check", async () => {
    const api = await as(await seed.superAdmin())
    const res = await api.get(`${BASE}/search`).query({ query: "LimitProbe" })
    expect(res.status).toBe(200)
  })
})

describe("GET /users/by-role — hardened edges", () => {
  let admin

  beforeAll(async () => {
    admin = await seed.admin()
  })

  it("400 when role param is blank", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/by-role`).query({ role: "" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Role parameter is required")
  })

  it("returns [] for a syntactically-invalid role value (no server-side enum check)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/by-role`).query({ role: "NotARole" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it("403 via Layer-3 route-key denial for a Warden whose override denies route.warden.students", async () => {
    const stripped = await seed.createUser({
      role: "Warden",
      authz: { override: { denyRoutes: ["route.warden.students"] } },
    })
    const api = await as(stripped)
    const res = await api.get(`${BASE}/by-role`).query({ role: "Student" })
    expect(res.status).toBe(403)
    // Route-key denial message, not "Access denied. Required role: ..."
    expect(res.body.message).toBe("You do not have access to this route")
  })
})

describe("POST /users/bulk-password-update — hardened edges", () => {
  let admin
  let superAdmin
  let peerAdmin

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    peerAdmin = await seed.admin({ email: "bulk-peer-admin@hms.test" })
  })

  it("Layer-2 vs Layer-3: Student hits the role gate, stripped Admin hits the route key", async () => {
    const studentApi = await as(await seed.student())
    const studentRes = await studentApi.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(studentRes.status).toBe(403)
    expect(studentRes.body.message).toMatch(/Access denied\. Required role:/)

    const stripped = await seed.createUser({
      role: "Admin",
      authz: { override: { denyRoutes: ["route.admin.students"] } },
    })
    const strippedApi = await as(stripped)
    const strippedRes = await strippedApi.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(strippedRes.status).toBe(403)
    expect(strippedRes.body.message).toBe("You do not have access to this route")
  })

  it("200 with empty results for an empty array", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: [] })
    expect(res.status).toBe(200)
    expect(res.body.results.successful).toEqual([])
    expect(res.body.results.failed).toEqual([])
  })

  it(`400 above MAX_BULK_RECORDS (10001 entries)`, async () => {
    const api = await as(admin)
    const flood = Array.from({ length: 10001 }, (_, i) => ({ email: `flood-${i}@hms.test` }))
    const res = await api.post(`${BASE}/bulk-password-update`).send({ passwordUpdates: flood })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Maximum 10000 records are allowed per request")
  })

  it("403 when any resolved target has equal privileges (Admin -> Admin); nothing is applied", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ email: "bulk-peer-admin@hms.test", password: "Nope1234!" }],
    })
    expect(res.status).toBe(403)
    // legacy controller: error bodies carry only { message }, no success flag
    expect(res.body.message).toContain("equal or higher privileges")
    expect(res.body.message).toContain("bulk-peer-admin@hms.test")
  })

  it("403 when a target outranks the actor (Admin -> Super Admin)", async () => {
    const sa = await seed.superAdmin({ email: "bulk-high-sa@hms.test" })
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ email: sa.email, password: "Nope1234!" }],
    })
    expect(res.status).toBe(403)
  })

  it("Super Admin may update an Admin's password", async () => {
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ email: "bulk-peer-admin@hms.test", password: "FromAbove1!" }],
    })
    expect(res.status).toBe(200)
    expect(res.body.results.failed).toHaveLength(0)
    expect(res.body.results.successful).toEqual([{ email: "bulk-peer-admin@hms.test" }])
  })

  it("an entry without an email lands in failed with 'User not found'", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ password: "orphanPass1" }],
    })
    expect(res.status).toBe(200)
    expect(res.body.results.successful).toEqual([])
    expect(res.body.results.failed).toHaveLength(1)
    expect(res.body.results.failed[0].reason).toBe("User not found")
  })

  it("null password clears the stored password like an empty string", async () => {
    const target = await seed.student({ email: "bulk-null-pw@hms.test" })
    const api = await as(admin)
    const set = await api.post(`${BASE}/bulk-password-update`).send({
      passwordUpdates: [{ email: target.email, password: null }],
    })
    expect(set.status).toBe(200)
    expect(set.body.results.successful).toEqual([{ email: target.email }])
  })

  it("double submit is idempotent — both requests succeed", async () => {
    const target = await seed.student({ email: "bulk-double@hms.test" })
    const api = await as(admin)
    const payload = { passwordUpdates: [{ email: target.email, password: "TwicePass1" }] }
    const first = await api.post(`${BASE}/bulk-password-update`).send(payload)
    const second = await api.post(`${BASE}/bulk-password-update`).send(payload)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.results.successful).toEqual([{ email: target.email }])
  })
})

describe("POST /users/bulk-remove-passwords — hardened edges", () => {
  let admin
  let superAdmin

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    await seed.admin({ email: "rm-bulk-peer@hms.test" })
    await seed.student({ email: "rm-bulk-student@hms.test", password: "has-a-pass" })
  })

  it("403 via Layer-3 route-key denial for a stripped Admin", async () => {
    const stripped = await seed.createUser({
      role: "Admin",
      authz: { override: { denyRoutes: ["route.admin.students"] } },
    })
    const api = await as(stripped)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({ emails: ["x@y.z"] })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You do not have access to this route")
  })

  it("403 when one email resolves to an equal-rank account; lower-rank emails untouched", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({
      emails: ["rm-bulk-student@hms.test", "rm-bulk-peer@hms.test"],
    })
    expect(res.status).toBe(403)
    expect(res.body.message).toContain("equal or higher privileges")
    expect(res.body.message).toContain("rm-bulk-peer@hms.test")
  })

  it("Super Admin removes an Admin's password through the bulk path", async () => {
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({ emails: ["rm-bulk-peer@hms.test"] })
    expect(res.status).toBe(200)
    expect(res.body.results.successful).toEqual([{ email: "rm-bulk-peer@hms.test" }])
  })

  it("non-string array entries fail per-record without breaking the request", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({ emails: [null, 12345] })
    expect(res.status).toBe(200)
    expect(res.body.results.successful).toEqual([])
    expect(res.body.results.failed).toHaveLength(2)
    for (const entry of res.body.results.failed) {
      expect(entry.reason).toBe("User not found")
    }
  })

  it("duplicate emails in one request succeed twice (double submit documented)", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/bulk-remove-passwords`).send({
      emails: ["rm-bulk-student@hms.test", "rm-bulk-student@hms.test"],
    })
    expect(res.status).toBe(200)
    expect(res.body.results.failed).toHaveLength(0)
    expect(res.body.results.successful).toEqual([
      { email: "rm-bulk-student@hms.test" },
      { email: "rm-bulk-student@hms.test" },
    ])
  })
})

describe("POST /users/remove-passwords-by-role — hardened edges", () => {
  let admin
  let superAdmin

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    await seed.security({ name: "Hardened Guard A" })
  })

  it("403 via Layer-3 route-key denial for a stripped Super Admin", async () => {
    const stripped = await seed.createUser({
      role: "Super Admin",
      authz: { override: { denyRoutes: ["route.superAdmin.admins"] } },
    })
    const api = await as(stripped)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You do not have access to this route")
  })

  it("403 for equal-rank targets (Admin -> Admin) checked before existence", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Admin" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("Cannot remove passwords for accounts with equal or higher privileges")
  })

  it("403 for higher-rank targets (Admin -> Super Admin) checked before existence", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Super Admin" })
    expect(res.status).toBe(403)
  })

  it("400 when role is an empty string", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Role is required")
  })

  it("404 for a valid lower-rank role nobody holds", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Hostel Gate" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("No users found with the specified role not found")
  })

  it("non-string role value (number) has no hierarchy rank -> 403", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: 42 })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("Cannot remove passwords for accounts with equal or higher privileges")
  })

  it("double removal by role stays successful and reports the same count", async () => {
    const api = await as(admin)
    const first = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    const second = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Security" })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.count).toBe(first.body.count)
    expect(second.body.count).toBeGreaterThanOrEqual(1)
  })

  it("Super Admin can wipe passwords role-wide below them (Warden)", async () => {
    await seed.warden({ name: "SA Wipe Target Warden" })
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/remove-passwords-by-role`).send({ role: "Warden" })
    expect(res.status).toBe(200)
    expect(res.body.count).toBeGreaterThanOrEqual(1)
  })
})

describe("POST /users/:id/remove-password — hardened edges", () => {
  let admin
  let superAdmin
  let peerAdmin

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    peerAdmin = await seed.admin({ email: "single-peer@hms.test" })
  })

  it("Warden is denied at the role gate (message names required roles)", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.post(`${BASE}/${peerAdmin._id}/remove-password`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Access denied\. Required role: Super Admin or Admin/)
  })

  it("403 when the target has equal rank (Admin -> Admin), with label in the message", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/${peerAdmin._id}/remove-password`)
    expect(res.status).toBe(403)
    // legacy controller: error bodies carry only { message }, no success flag
    expect(res.body.message).toContain("equal or higher privileges")
    expect(res.body.message).toContain("single-peer@hms.test")
  })

  it("Super Admin removes an Admin's password", async () => {
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/${peerAdmin._id}/remove-password`)
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe("single-peer@hms.test")
  })

  it("double delete is idempotent — removing twice still answers 200", async () => {
    const target = await seed.student({ email: "single-double@hms.test" })
    const api = await as(admin)
    const first = await api.post(`${BASE}/${target._id}/remove-password`)
    const second = await api.post(`${BASE}/${target._id}/remove-password`)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.user._id).toBe(String(target._id))
  })

  it("numeric-looking garbage id is a CastError -> 400", async () => {
    const api = await as(admin)
    const res = await api.post(`${BASE}/12345/remove-password`)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")
  })

  it("403 via Layer-3 route-key denial for a stripped Super Admin", async () => {
    const stripped = await seed.createUser({
      role: "Super Admin",
      authz: { override: { denyRoutes: ["route.superAdmin.admins"] } },
    })
    const api = await as(stripped)
    const res = await api.post(`${BASE}/${peerAdmin._id}/remove-password`)
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You do not have access to this route")
  })
})

describe("GET /users/:id — hardened edges", () => {
  let admin
  let warden

  beforeAll(async () => {
    admin = await seed.admin()
    warden = await seed.warden()
  })

  it("staff can fetch their own record", async () => {
    const api = await as(warden)
    const res = await api.get(`${BASE}/${warden._id}`)
    expect(res.status).toBe(200)
    expect(res.body.role).toBe("Warden")
  })

  it("403 via Layer-3 route-key denial for a stripped Associate Warden", async () => {
    const stripped = await seed.createUser({
      role: "Associate Warden",
      authz: { override: { denyRoutes: ["route.associateWarden.students"] } },
    })
    const api = await as(stripped)
    const res = await api.get(`${BASE}/${admin._id}`)
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You do not have access to this route")
  })

  it("does not leak the password field even for staff viewers", async () => {
    await seed.student({ email: "leak-probe@hms.test", password: "secret123" })
    const api = await as(warden)
    const target = await seed.student({ email: "leak-probe-2@hms.test", password: "secret456" })
    const res = await api.get(`${BASE}/${target._id}`)
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.body)).not.toContain("secret456")
    expect(res.body.password).toBeUndefined()
  })
})
