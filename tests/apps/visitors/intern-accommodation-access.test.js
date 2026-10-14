import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const base = "/api/v1/intern-accommodation"
const routeKey = "route.dining.internAccommodation"

describe("H4 workflow role access", () => {
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

  it("denies unrelated roles even with cached or explicitly granted H4 permissions", async () => {
    for (const [role, subRole] of [["Student", null], ["Warden", null], ["Associate Warden", null], ["Dining", "Office"], ["Admin", "HCU"], ["Admin", null], ["Super Admin", null], ["Security", null], ["Maintenance Staff", null], ["Gymkhana", "President Gymkhana"]]) {
      const user = await seed.createUser({ role, subRole })
      const api = await as(user, { userData: { authz: { override: { allowRoutes: [routeKey] }, effective: { catalogVersion: 21, routeAccess: { [routeKey]: true, "route.admin.internAccommodation": true, "route.student.internAccommodation": true } } } } })
      expect((await api.get(`${base}/options`)).status, `${role} ${subRole}`).toBe(403)
      expect((await api.get(`${base}/requests`)).status).toBe(403)
      expect((await api.post(`${base}/batches`).send({})).status).toBe(403)
    }
  })
  it("retains access for every role involved in the workflow", async () => {
    for (const [role, subRole] of [["Academics", null], ["Admin", "Chief Warden Office"], ["Admin", "Chief Warden"], ["Admin", "Accountant"], ["Hostel Supervisor", null], ["Hostel Gate", null]]) {
      const api = await as(await seed.createUser({ role, subRole, email: `h4-${Math.random()}@iiti.ac.in` }))
      const options = await api.get(`${base}/options`)
      expect(options.status, `${role} ${subRole}`).toBe(200)
      expect(options.body.data.canCreate).toBe(role === "Academics")
      expect((await api.get(`${base}/requests`)).status).toBe(200)
    }
  })
})
