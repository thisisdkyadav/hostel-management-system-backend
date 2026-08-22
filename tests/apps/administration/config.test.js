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

// Config routes are NOT envelope-wrapped: the controller sends the service
// payload directly (raw objects), while errors come back as { message } or
// { success: false, message }. Assert accordingly below.
const BASE = "/api/v1/config"

describe("GET /config/:key", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/degrees`)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/degrees`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("403 for a warden", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.get(`${BASE}/degrees`)
    expect(res.status).toBe(403)
  })

  it("404 for an unknown key (no default registered)", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/definitelyNotAConfigKey`)
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/not found/i)
  })

  it("returns the default config for a known key that was never written", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/studentEditableFields`)
    expect(res.status).toBe(200)
    // raw payload: { key, value, description, lastUpdated }
    expect(res.body.key).toBe("studentEditableFields")
    expect(res.body.value).toEqual(["profileImage", "dateOfBirth"])
    expect(typeof res.body.description).toBe("string")
    expect(res.body.lastUpdated).toBeDefined()
  })

  it("?valueOnly=true returns just the raw value", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/studentEditableFields`).query({ valueOnly: "true" })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(["profileImage", "dateOfBirth"])
  })

  describe("accommodation key sub-role gate", () => {
    it("403 for an admin without an allowed sub-role", async () => {
      const admin = await seed.admin()
      const api = await as(admin)
      const res = await api.get(`${BASE}/accommodation`)
      expect(res.status).toBe(403)
      expect(res.body.message).toMatch(/Chief Warden Office and Accountant/i)
    })

    it("403 for an admin with a non-accommodation sub-role", async () => {
      const admin = await seed.createUser({ role: "Admin", subRole: "HCU" })
      const api = await as(admin)
      const res = await api.get(`${BASE}/accommodation`)
      expect(res.status).toBe(403)
    })

    it("200 for an Accountant admin", async () => {
      const admin = await seed.createUser({ role: "Admin", subRole: "Accountant" })
      const api = await as(admin)
      const res = await api.get(`${BASE}/accommodation`)
      expect(res.status).toBe(200)
      expect(res.body.key).toBe("accommodation")
      expect(res.body.value).toHaveProperty("pricePerPerson1")
    })
  })
})

describe("PUT /config/:key", () => {
  let adminApi

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/systemSettings`).send({ value: {} })
    expect(res.status).toBe(401)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.put(`${BASE}/systemSettings`).send({ value: {} })
    expect(res.status).toBe(403)
  })

  it("400 when value is missing", async () => {
    const res = await adminApi.put(`${BASE}/systemSettings`).send({ description: "no value" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/value is required/i)
  })

  it("400 when degrees is not an array of strings", async () => {
    const res = await adminApi.put(`${BASE}/degrees`).send({ value: "BTech" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/must be an array of strings/i)
  })

  it("400 when degrees contains the reserved mixed-scope key", async () => {
    const res = await adminApi.put(`${BASE}/degrees`).send({ value: ["BTech", "__MIXED__"] })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/__MIXED__/)
  })

  it("updates degrees and persists via follow-up GET (sorted)", async () => {
    const res = await adminApi.put(`${BASE}/degrees`).send({
      value: ["MTech", "BTech"],
      description: "Integration-test degree list",
    })
    expect(res.status).toBe(200)
    expect(res.body.configuration.key).toBe("degrees")

    const get = await adminApi.get(`${BASE}/degrees`)
    expect(get.status).toBe(200)
    expect(get.body.value).toEqual(["BTech", "MTech"])
    expect(get.body.description).toBe("Integration-test degree list")
  })

  it("normalizes string lists: trims, case-insensitive dedupe keeping first casing", async () => {
    const res = await adminApi.put(`${BASE}/departments`).send({
      value: [" Civil Engineering ", "civil engineering", "Mechanical Engineering"],
    })
    expect(res.status).toBe(200)

    const get = await adminApi.get(`${BASE}/departments`)
    expect(get.body.value).toEqual(["Civil Engineering", "Mechanical Engineering"])
  })

  it("academicHolidays: 400 on invalid year key; happy path sorts + dedupes", async () => {
    const bad = await adminApi.put(`${BASE}/academicHolidays`).send({
      value: { "20x6": [{ title: "Diwali", date: "2026-11-08" }] },
    })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toMatch(/Invalid year key/i)

    const good = await adminApi.put(`${BASE}/academicHolidays`).send({
      value: {
        "2027": [
          { title: "Diwali", date: "2027-10-29" },
          { title: "Holi", date: "2027-03-22" },
          // duplicate (same date + title, case differs) -> dropped
          { title: "holi", date: "2027-03-22" },
          { title: "Independence Day", date: "2027-08-15" },
        ],
      },
    })
    expect(good.status).toBe(200)

    const get = await adminApi.get(`${BASE}/academicHolidays`)
    expect(get.body.value["2027"]).toEqual([
      { title: "Holi", date: "2027-03-22" },
      { title: "Independence Day", date: "2027-08-15" },
      { title: "Diwali", date: "2027-10-29" },
    ])
  })

  it("round-trips an arbitrary object config (systemSettings)", async () => {
    const res = await adminApi.put(`${BASE}/systemSettings`).send({
      value: { visitorPaymentLink: "https://pay.example.com/x" },
    })
    expect(res.status).toBe(200)

    const get = await adminApi.get(`${BASE}/systemSettings`)
    expect(get.body.value).toEqual({ visitorPaymentLink: "https://pay.example.com/x" })
  })

  it("403 for accommodation updates without an allowed sub-role", async () => {
    const res = await adminApi.put(`${BASE}/accommodation`).send({ value: { gstin: "X" } })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Chief Warden Office and Accountant/i)
  })

  it("Accountant can update accommodation settings", async () => {
    const accountant = await seed.createUser({ role: "Admin", subRole: "Accountant" })
    const api = await as(accountant)
    const res = await api
      .put(`${BASE}/accommodation`)
      .send({ value: { pricePerPerson1: 250, gstPercentage1: 5 } })
    expect(res.status).toBe(200)

    const get = await api.get(`${BASE}/accommodation`)
    expect(get.body.value.pricePerPerson1).toBe(250)
    expect(get.body.value.gstPercentage1).toBe(5)
  })
})

describe("POST /config/:key/reset", () => {
  let adminApi

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/systemSettings/reset`)
    expect(res.status).toBe(401)
  })

  it("403 for a student", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.post(`${BASE}/systemSettings/reset`)
    expect(res.status).toBe(403)
  })

  it("404 for a key with no registered default", async () => {
    const res = await adminApi.post(`${BASE}/definitelyNotAConfigKey/reset`)
    expect(res.status).toBe(404)
    expect(res.body.message).toMatch(/No default configuration exists/i)
  })

  it("restores the default value after an override", async () => {
    const custom = await adminApi.put(`${BASE}/studentGroups`).send({
      value: ["Club A", "Club B"],
      description: "custom groups",
    })
    expect(custom.status).toBe(200)

    const getCustom = await adminApi.get(`${BASE}/studentGroups`)
    expect(getCustom.body.value).toEqual(["Club A", "Club B"])

    const reset = await adminApi.post(`${BASE}/studentGroups/reset`)
    expect(reset.status).toBe(200)
    expect(reset.body.configuration.key).toBe("studentGroups")

    const getReset = await adminApi.get(`${BASE}/studentGroups`)
    expect(getReset.body.value).toEqual([]) // default per configDefaults
    expect(getReset.body.description).not.toBe("custom groups")
  })
})
