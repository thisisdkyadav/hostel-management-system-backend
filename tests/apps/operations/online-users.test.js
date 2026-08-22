import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  initRealtime,
  createHostel,
  fabricateOnlineUser,
  clearOnlineUsersKeys,
} from "../../helpers/seed/operations.js"

const BASE = "/api/v1/online-users"

let admin, superAdmin, student, warden
let hostel

beforeAll(async () => {
  await setupTestDb()
  // The online-users service reads Redis through the Socket.IO loader's pub
  // client; boot it against a never-listening server so the endpoints work.
  await initRealtime()

  admin = await seed.admin()
  superAdmin = await seed.superAdmin()
  student = await seed.student({ name: "Online Student" })
  warden = await seed.warden()
  hostel = await createHostel({ name: "Online Hostel", type: "room-only" })

  // Fabricate presence directly in Redis (same keys utils/redisOnlineUsers.js uses)
  await fabricateOnlineUser({
    userId: String(student._id),
    role: "Student",
    hostelId: String(hostel._id),
    userName: student.name,
    userEmail: student.email,
  })
  await fabricateOnlineUser({
    userId: String(warden._id),
    role: "Warden",
    hostelId: null,
    userName: warden.name,
    userEmail: warden.email,
  })
})

afterAll(async () => {
  // online:* keys are a global namespace — clean up after ourselves.
  await clearOnlineUsersKeys()
  await teardownTestDb()
})

describe("GET /api/v1/online-users", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles (Student)", async () => {
    const api = await as(student)
    const res = await api.get(BASE)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("200 lists online users with pagination for Admin", async () => {
    const api = await as(admin)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveLength(2)
    expect(res.body.pagination).toMatchObject({ total: 2, page: 1, limit: 50, totalPages: 1 })

    const ids = res.body.data.map((u) => String(u.userId))
    expect(ids).toContain(String(student._id))
    expect(ids).toContain(String(warden._id))
  })

  it("200 works for Super Admin", async () => {
    const api = await as(superAdmin)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
  })

  it("filters by role", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ role: "Warden" })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].role).toBe("Warden")
    expect(String(res.body.data[0].userId)).toBe(String(warden._id))
  })

  it("filters by hostelId and resolves hostelName from Mongo", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ hostelId: String(hostel._id) })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].hostelName).toBe(hostel.name)

    // users without a hostel get hostelName null
    const all = await as(admin)
    const resAll = await all.get(BASE)
    const wardenRow = resAll.body.data.find((u) => u.role === "Warden")
    expect(wardenRow.hostelName).toBeNull()
  })

  it("paginates with page/limit", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ page: 2, limit: 1 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.pagination).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 })
  })
})

describe("GET /api/v1/online-users/stats", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles", async () => {
    const api = await as(student)
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(403)
  })

  it("200 returns totals recalculated from live entries", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/stats`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.totalOnline).toBe(2)
    expect(res.body.data.byRole).toEqual({ Student: 1, Warden: 1 })
    expect(res.body.data.byHostel).toEqual([{ hostelId: String(hostel._id), count: 1 }])
  })
})

describe("GET /api/v1/online-users/:userId", () => {
  it("401 when unauthenticated", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/${student._id}`)
    expect(res.status).toBe(401)
  })

  it("200 returns the online status for any authenticated user (Student allowed here)", async () => {
    const other = await seed.student()
    const api = await as(other)
    const res = await api.get(`${BASE}/${student._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(String(res.body.data.userId)).toBe(String(student._id))
    expect(res.body.data.role).toBe("Student")
    expect(res.body.data.socketCount).toBeGreaterThanOrEqual(1)
  })

  it("404 when the user is not currently online", async () => {
    const offline = await seed.student()
    const api = await as(admin)
    const res = await api.get(`${BASE}/${offline._id}`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    // Service passes a full sentence to notFound(), which appends " not found".
    expect(res.body.message).toBe("User is not currently online not found")
  })
})

// ---------------------------------------------------------------------------
// Hardening: pagination/filter/param edges
// ---------------------------------------------------------------------------
describe("GET /api/v1/online-users — edge inputs", () => {
  it("403 for more non-admin roles (Warden, Maintenance Staff)", async () => {
    for (const user of [warden, await seed.maintenanceStaff()]) {
      const api = await as(user)
      const res = await api.get(BASE)
      expect(res.status).toBe(403)
      const resStats = await api.get(`${BASE}/stats`)
      expect(resStats.status).toBe(403)
    }
  })

  it("200 empty page for page=0 (slice clamps negative skip)", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ page: 0, limit: 50 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(res.body.pagination.page).toBe(0)
  })

  it("200 empty page for page=-1", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ page: -1, limit: 50 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it("200 empty page for non-numeric page (parseInt NaN -> slice(NaN) -> [])", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ page: "abc", limit: 50 })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })

  it("200 honors limit=1000 and returns every online user in one page", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ page: 1, limit: 1000 })
    expect(res.status).toBe(200)
    expect(res.body.pagination.limit).toBe(1000)
    expect(res.body.data.length).toBeGreaterThanOrEqual(2)
    expect(res.body.pagination.totalPages).toBe(1)
  })

  it("200 zero matches for an invalid role filter value", async () => {
    const api = await as(admin)
    const res = await api.get(BASE).query({ role: "SupremeLeader" })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
    expect(res.body.pagination.total).toBe(0)
    expect(res.body.pagination.totalPages).toBe(0)
  })

  it("200 zero matches for a hostelId filter with no online users", async () => {
    const api = await as(admin)
    const ghostHostel = await createHostel({ name: "Online Ghost Hostel" })
    const res = await api.get(BASE).query({ hostelId: String(ghostHostel._id) })
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(0)
  })
})

describe("GET /api/v1/online-users/:userId — param edges", () => {
  it("404 for a malformed userId (treated as simply-not-online)", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/not-an-object-id`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
  })

  it("404 for a well-formed but unknown userId", async () => {
    const { default: mongoose } = await import("mongoose")
    const api = await as(admin)
    const res = await api.get(`${BASE}/${new mongoose.Types.ObjectId()}`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("User is not currently online not found")
  })
})
