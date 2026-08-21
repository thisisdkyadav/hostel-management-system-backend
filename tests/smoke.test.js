import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "./helpers/db.js"
import { as, anon } from "./helpers/http.js"
import { seed } from "./helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("harness smoke", () => {
  it("GET /health returns ok without auth", async () => {
    const api = await anon()
    const res = await api.get("/health")
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("ok")
    expect(typeof res.body.timestamp).toBe("string")
  })

  it("protected route rejects unauthenticated requests with 401 envelope", async () => {
    const api = await anon()
    const res = await api.get("/api/v1/users/profile")
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("fabricated session authenticates as the seeded user", async () => {
    const student = await seed.student({ name: "Smoke Student" })
    const api = await as(student)
    const res = await api.get("/api/v1/authz/me").send({})
    // Route exists and recognizes the session (status may be 200 or a
    // role-based denial — either proves session auth worked; 401 would not).
    expect(res.status).not.toBe(401)
  })
})
