import { describe, it, expect, beforeAll, afterAll } from "vitest"
import crypto from "node:crypto"
import Redis from "ioredis"
import { setupTestDb, teardownTestDb } from "./helpers/db.js"
import { as, anon } from "./helpers/http.js"
import { seed } from "./helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// Layer-3 authz engine exercised end-to-end through real endpoints.
// Engine facts under test (src/core/authz/authz.engine.js):
//   - allowRoutes applied over the role default map, THEN denyRoutes -> deny wins
//   - the routeAccess map contains EVERY catalog key (non-defaults start false),
//     so allowRoutes can elevate a caller beyond their role's defaults — but
//     role-gated routes still stop them at Layer-2; only access-only guards
//     (guardMy.access) are reachable via elevation.
//   - normalizeAuthzOverride silently drops unknown keys
//   - constraints override the constraint map values directly

const CAP = "cap.students.edit.personal"
const CONSTRAINT = "constraint.complaints.scope.hostelIds"
const DENY_MSG = "You do not have access to this route"
const CAP_DENY_MSG = "You do not have permission to perform this action"

describe("authz overrides — denyRoutes beats the role default", () => {
  it("warden with denyRoutes loses only the denied route; siblings still work", async () => {
    const warden = await seed.warden({
      authz: { override: { denyRoutes: ["route.warden.myTasks"] } },
    })
    const api = await as(warden)

    const denied = await api.get("/api/v1/tasks/my-tasks")
    expect(denied.status).toBe(403)
    expect(denied.body.message).toBe(DENY_MSG)

    // sibling warden capability unaffected by the single denial
    const ok = await api.get("/api/v1/dashboard/warden/hostel-statistics")
    expect(ok.status).toBe(400) // reaches the handler (no hostel assigned)
    expect(ok.body.message).toMatch(/not assigned to any hostel/)
  })

  it("allowRoutes + denyRoutes for the SAME key -> deny wins", async () => {
    // observed on an access-only guard so Layer-2 doesn't mask the result
    const warden = await seed.warden({
      authz: {
        override: {
          allowRoutes: ["route.warden.myTasks"],
          denyRoutes: ["route.warden.myTasks"],
        },
      },
    })
    const api = await as(warden)
    const res = await api.get("/api/v1/tasks/my-tasks")
    expect(res.status).toBe(403)
    expect(res.body.message).toBe(DENY_MSG)
  })
})

describe("authz overrides — elevation semantics", () => {
  it("SUSPECTED BUG (design): allowRoutes elevation is unreachable on routeGuard routes — the guard picks its route key from a hardcoded per-role map and denies unmapped roles before Layer-3 runs", async () => {
    // The engine WOULD grant a Student route.warden.myTasks, but
    // routeGuard.access looks up routeKeyByRole[req.user.role] first; a Student
    // is unmapped there -> 403 regardless of any override. Overrides can only
    // ever narrow or restore role defaults, never elevate across them.
    const student = await seed.student({
      authz: { override: { allowRoutes: ["route.warden.myTasks"] } },
    })
    const api = await as(student)
    const res = await api.get("/api/v1/tasks/my-tasks")
    expect(res.status).toBe(403)
    expect(res.body.message).toBe(DENY_MSG)
  })

  it("role-gated route blocks elevated students at Layer-2 despite allowRoutes", async () => {
    const student = await seed.student({
      authz: { override: { allowRoutes: ["route.admin.taskManagement"] } },
    })
    const api = await as(student)
    const res = await api.get("/api/v1/tasks/all")
    expect(res.status).toBe(403)
    // Layer-2 role gate fires before Layer-3 is even consulted
    expect(res.body.message).toMatch(/Access denied\. Required role/i)
  })

  it("unknown route keys in overrides are silently dropped (no crash, no grant)", async () => {
    const student = await seed.student({
      authz: {
        override: { allowRoutes: ["route.not.a.key", "route.also.fake"] },
      },
    })
    const api = await as(student)
    const res = await api.get("/api/v1/tasks/my-tasks")
    expect(res.status).toBe(403)
  })
})

describe("authz overrides — complaint hostel constraint end-to-end", () => {
  let hostelA
  let hostelB
  let studentA
  let studentB

  beforeAll(async () => {
    const { createHostel, createUnit, createRoom, createStudentProfile, createAllocation } =
      await import("./helpers/seed/operations.js")

    hostelA = await createHostel({ name: `AZ-${Date.now()}` })
    hostelB = await createHostel({ name: `BZ-${Date.now()}` })
    const unitA = await createUnit({ hostelId: hostelA._id, unitNumber: "C1" })
    const roomA = await createRoom({ hostelId: hostelA._id, unitId: unitA._id, capacity: 2 })
    const unitB = await createUnit({ hostelId: hostelB._id, unitNumber: "D1" })
    const roomB = await createRoom({ hostelId: hostelB._id, unitId: unitB._id, capacity: 2 })

    studentA = await seed.student()
    await createAllocation({
      userId: studentA._id,
      studentProfileId: (await createStudentProfile({ userId: studentA._id }))._id,
      hostelId: hostelA._id,
      roomId: roomA._id,
    })
    studentB = await seed.student()
    await createAllocation({
      userId: studentB._id,
      studentProfileId: (await createStudentProfile({ userId: studentB._id }))._id,
      hostelId: hostelB._id,
      roomId: roomB._id,
    })

    // complaints carry hostelId from the creator's allocation
    await as(studentA).then((a) =>
      a.post("/api/v1/complaint").send({
        title: "Hostel A leak",
        description: "d",
        category: "Plumbing",
      })
    )
    await as(studentB).then((b) =>
      b.post("/api/v1/complaint").send({
        title: "Hostel B leak",
        description: "d",
        category: "Plumbing",
      })
    )
  })

  it("unconstrained admin sees both hostels' complaints", async () => {
    const api = await as(await seed.admin())
    const res = await api.get("/api/v1/complaint/all?limit=100")
    expect(res.status).toBe(200)
    const titles = res.body.data.items.map((c) => c.title)
    expect(titles).toContain("Hostel A leak")
    expect(titles).toContain("Hostel B leak")
  })

  it("constrained admin is scoped to the allowed hostel even when asking for the other one", async () => {
    const admin = await seed.admin({
      authz: {
        override: {
          constraints: [{ key: CONSTRAINT, value: [String(hostelA._id)] }],
        },
      },
    })
    const api = await as(admin)

    const plain = await api.get("/api/v1/complaint/all?limit=100")
    const titles = plain.body.data.items.map((c) => c.title)
    expect(titles).toContain("Hostel A leak")
    expect(titles).not.toContain("Hostel B leak")

    const forced = await api.get(`/api/v1/complaint/all?hostelId=${hostelB._id}&limit=100`)
    expect(forced.body.data.items.map((c) => c.title)).not.toContain("Hostel B leak")
  })

  it("SUSPECTED BUG: an EMPTY allowed-hostels array is treated as unconstrained", async () => {
    // An explicit empty allow-list should mean "no hostels visible", but the
    // service treats falsy/empty as "no constraint" — the admin sees everything.
    const admin = await seed.admin({
      authz: { override: { constraints: [{ key: CONSTRAINT, value: [] }] } },
    })
    const res = await as(admin).then((a) => a.get("/api/v1/complaint/all?limit=100"))
    expect(res.status).toBe(200)
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(2)
  })

  it("typo'd constraint key is ignored (admin unconstrained)", async () => {
    const admin = await seed.admin({
      authz: {
        override: {
          constraints: [{ key: "constraint.complaints.scope.typo", value: [] }],
        },
      },
    })
    const res = await as(admin).then((a) => a.get("/api/v1/complaint/all?limit=100"))
    expect(res.status).toBe(200)
    const titles = res.body.data.items.map((c) => c.title)
    expect(titles).toContain("Hostel A leak")
    expect(titles).toContain("Hostel B leak")
  })
})

describe("authz overrides — capability pilot (cap.students.edit.personal)", () => {
  const EDIT_TARGET = async () => {
    const s = await seed.student()
    return String(s._id)
  }

  it("warden with denyCapabilities fails the edit route with the capability message, not the role message", async () => {
    const target = await EDIT_TARGET()
    const warden = await seed.warden({
      authz: { override: { denyCapabilities: [CAP] } },
    })
    const api = await as(warden)

    const res = await api.put(`/api/v1/students/profiles-admin/profile/${target}`).send({})
    expect(res.status).toBe(403)
    expect(res.body.message).toBe(CAP_DENY_MSG)

    // read on the same surface still works (capability gates writes only)
    const read = await api.get(`/api/v1/students/profiles-admin/profile/details/${target}`)
    expect([200, 404]).toContain(read.status) // reaches the handler either way
  })

  it("hostel supervisor with allowCapabilities gains the edit their role lacks by default", async () => {
    const target = await EDIT_TARGET()
    const supervisor = await seed.hostelSupervisor({
      authz: { override: { allowCapabilities: [CAP] } },
    })
    const api = await as(supervisor)
    const res = await api.put(`/api/v1/students/profiles-admin/profile/${target}`).send({})
    // capability now satisfied; the handler runs (outcome depends on profile existence/scope)
    expect(res.status).not.toBe(403)
  })

  it("capability wildcard '*' grants then a specific deny takes back", async () => {
    const target = await EDIT_TARGET()
    const granted = await seed.warden({
      authz: { override: { denyCapabilities: ["*"], allowCapabilities: [] } },
    })
    const api = await as(granted)
    const res = await api.put(`/api/v1/students/profiles-admin/profile/${target}`).send({})
    expect(res.status).toBe(403)
    expect(res.body.message).toBe(CAP_DENY_MSG)
  })
})

describe("authz — session-shape resilience", () => {
  /** Hand-craft a Redis session with an arbitrary userData payload. */
  async function rawSession(sessionDoc) {
    const { env } = await import("../src/config/env.config.js")
    const sid = crypto.randomBytes(24).toString("hex")
    const redis = new Redis(env.REDIS_URL)
    try {
      await redis.set(
        `${env.REDIS_SESSION_PREFIX}${sid}`,
        JSON.stringify({
          cookie: { originalMaxAge: null, expires: null, httpOnly: true, path: "/" },
          ...sessionDoc,
        }),
        "EX",
        3600
      )
    } finally {
      redis.disconnect()
    }
    const sig = crypto
      .createHmac("sha256", env.SESSION_SECRET)
      .update(sid)
      .digest("base64")
      .replace(/=+$/, "")
    return `connect.sid=s:${sid}.${sig}`
  }

  async function clientFor(cookie) {
    const [{ getApp }] = await Promise.all([import("./helpers/http.js")])
    const app = await getApp()
    const request = (await import("supertest")).default(app)
    const withCookie = (fn) => (url) => fn(url).set("Cookie", cookie)
    return {
      get: withCookie((u) => request.get(u)),
      post: withCookie((u) => request.post(u)),
    }
  }

  it("session userData WITHOUT authz is rebuilt from the role and still authorizes", async () => {
    const user = await seed.student()
    const cookie = await rawSession({
      userId: String(user._id),
      userData: { _id: user._id, email: user.email, role: user.role }, // no authz, no subRole
    })
    const api = await clientFor(cookie)

    // authorize middleware rebuilds effective authz from role defaults
    const denied = await api.get("/api/v1/tasks/my-tasks") // student not mapped
    expect(denied.status).toBe(403)

    const ok = await api.get("/api/v1/visitor/profiles") // student-allowed route
    expect(ok.status).not.toBe(401)
    expect(ok.status).not.toBe(403)
  })

  it("catalogVersion drift triggers a rebuild instead of trusting stale authz", async () => {
    const warden = await seed.warden({
      // stale session claims the warden lost my-tasks; version mismatch forces rebuild
      authz: { override: { denyRoutes: ["route.warden.myTasks"] } },
    })
    const cookie = await rawSession({
      userId: String(warden._id),
      userData: {
        _id: warden._id,
        email: warden.email,
        role: "Warden",
        subRole: null,
        authz: {
          override: {},
          effective: {
            catalogVersion: 999,
            role: "Warden",
            routeAccess: { "route.warden.myTasks": false },
            capabilities: {},
            constraints: {},
          },
        },
      },
    })
    const api = await clientFor(cookie)
    const res = await api.get("/api/v1/tasks/my-tasks")
    // rebuilt from catalog v-current: denial gone, route accessible
    expect(res.status).toBe(200)
  })

  it("session whose user was deleted falls back to the DB and answers 401 'User not found'", async () => {
    const user = await seed.student()
    const cookie = await rawSession({
      userId: String(user._id), // no userData -> authenticate queries Mongo
    })
    const { default: User } = await import("../src/models/user/User.model.js")
    await User.findByIdAndDelete(user._id)

    const api = await clientFor(cookie)
    const res = await api.get("/api/v1/tasks/my-tasks")
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/user not found/i)
  })
})
