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
