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

// GET /api/v1/dining-office/dashboard — Dining role + route.diningOffice.dashboard
// (held by the "Office" sub-role). Wire: { success, message?, data }.

describe("dining office — auth wall", () => {
  it("401 without a session", async () => {
    const api = await anon()
    expect((await api.get("/api/v1/dining-office/dashboard")).status).toBe(401)
  })

  it("non-Dining roles are 403", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/dining-office/dashboard")).status).toBe(403)

    const adminApi = await as(await seed.admin())
    expect((await adminApi.get("/api/v1/dining-office/dashboard")).status).toBe(403)
  })

  it("Dining/Caterer lacks the diningOffice route key and is denied", async () => {
    const catererApi = await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))
    expect((await catererApi.get("/api/v1/dining-office/dashboard")).status).toBe(403)
  })
})

describe("dining office — dashboard", () => {
  it("serves the oversight dashboard for Dining/Office", async () => {
    const api = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    const res = await api.get("/api/v1/dining-office/dashboard")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toBeDefined()
  })
})
