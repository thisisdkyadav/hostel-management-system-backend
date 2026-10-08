import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const base = "/api/v1/intern-accommodation"
const routeKey = "route.dining.internAccommodation"

describe("H4 Dining access", () => {
  it("denies Caterer access, including sessions cached before the permission change", async () => {
    const user = await seed.createUser({ role: "Dining", subRole: "Caterer" })
    const current = await as(user)
    const cached = await as(user, {
      userData: {
        authz: {
          override: {},
          effective: { catalogVersion: 20, routeAccess: { [routeKey]: true } },
        },
      },
    })
    for (const api of [current, cached]) {
      for (const path of ["/options", "/requests"]) {
        const result = await api.get(`${base}${path}`)
        expect(result.status).toBe(403)
        expect(result.body.success).toBe(false)
      }
      const result = await api.post(`${base}/batches`).send({})
      expect(result.status).toBe(403)
      expect(result.body.success).toBe(false)
    }
  })

  it("retains Dining Office viewing and Academics creation permissions", async () => {
    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    const options = await office.get(`${base}/options`)
    expect(options.status).toBe(200)
    expect(options.body.data.canCreate).toBe(false)
    expect((await office.get(`${base}/requests`)).status).toBe(200)

    const academics = await as(
      await seed.createUser({ role: "Academics", email: "h4-academic-access@iiti.ac.in" }),
    )
    const academicOptions = await academics.get(`${base}/options`)
    expect(academicOptions.status).toBe(200)
    expect(academicOptions.body.data.canCreate).toBe(true)
  })
})
