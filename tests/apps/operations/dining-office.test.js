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

describe("dining office — hardening edges", () => {
  it("dashboard aggregates every non-archived caterer into the breakdown with zeroed capacity", async () => {
    // one real Caterer login so the breakdown has an entry
    const { default: Caterer } = await import("../../../src/models/index.js").then((m) => ({
      default: m.Caterer,
    }))
    const name = `Office View Foods ${Date.now().toString(36)}`
    const catererUser = await seed.createUser({ role: "Dining", subRole: "Caterer", name: `${name} Manager` })
    await Caterer.create({
      name,
      email: `office-view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@hms.test`,
      userId: catererUser._id,
    })

    const api = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    const res = await api.get("/api/v1/dining-office/dashboard")
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.caterers.total).toBeGreaterThanOrEqual(1)
    const entry = data.caterers.breakdown.find((c) => c.name === name)
    expect(entry).toBeTruthy()
    // no capacity rows configured for this period -> zeroed utilization
    expect(entry.maxStudentCount).toBe(0)
    expect(entry.allocatedCount).toBe(0)
    expect(entry.utilization).toBe(0)

    // today's counters exist even when there is no allocation data
    for (const key of ["allocated", "verified", "onRebate", "pending"]) {
      expect(Number(data.today[key])).toBeGreaterThanOrEqual(0)
    }
    expect(data.rebates).toHaveProperty("pending")
    expect(data.rebates).toHaveProperty("approvedToday")
    expect(data.rebates).toHaveProperty("upcoming")
    expect(Number(data.billing.periodCount)).toBeGreaterThanOrEqual(0)

    // generatedAt is a fresh ISO timestamp
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false)

    // the Dining/Caterer role itself still cannot read the office dashboard
    const catererApi = await as(catererUser)
    expect((await catererApi.get("/api/v1/dining-office/dashboard")).status).toBe(403)
  })
})
