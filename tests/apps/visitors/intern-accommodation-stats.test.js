import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const base = "/api/v1/intern-accommodation"
const ymd = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const student = (gender, i) => ({
  name: `Intern ${i}`, gender, category: "intern", email: `intern${i}@example.com`,
  mobile: "9876543210", institute: "Institute", instituteAddress: "Indore", course: "BTech", department: "Physics", payerType: "intern",
  stay: { fromDate: ymd(5), toDate: ymd(10), purpose: "Research" },
})

describe("H4 desk gender stats", () => {
  it("counts pending, active and total by gender for desk roles only", async () => {
    const professor = await seed.createUser({ role: "Academics", email: `h4-stats-${Date.now()}@iiti.ac.in` })
    const api = await as(professor)
    const office = await as(await seed.admin({ subRole: "Chief Warden Office" }))
    expect((await api.get(`${base}/stats`)).status).toBe(403)
    const before = (await office.get(`${base}/stats`)).body.data

    const created = await api.post(`${base}/batches`).send({
      students: [student("Male", 1), student("Male", 2), student("Female", 3)],
      recommend: true,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    await api.post(`${base}/batches`).send({ students: [student("Female", 4)], draft: true })
    // Presence follows the dates, not gate check-in: an approved stay that has started is active.
    const { AccommodationRequest } = await import("../../../src/models/index.js")
    const [started, upcoming] = created.body.data.items
    await AccommodationRequest.updateOne(
      { _id: started._id },
      { status: "Rooms Assigned", "stay.fromDate": new Date(ymd(-1)), "stay.toDate": new Date(ymd(3)) },
    )
    await AccommodationRequest.updateOne({ _id: upcoming._id }, { status: "Rooms Assigned" })

    for (const sub of ["Chief Warden Office", "Chief Warden", "Accountant"]) {
      const res = await (sub === "Chief Warden Office" ? office : await as(await seed.admin({ subRole: sub }))).get(`${base}/stats`)
      expect(res.status).toBe(200)
      const d = res.body.data
      const delta = (bucket, g) => (d[bucket][g] || 0) - (before[bucket][g] || 0)
      expect([delta("pending", "Male"), delta("pending", "Female")]).toEqual([1, 1])
      expect([delta("active", "Male"), delta("active", "Female")]).toEqual([1, 0])
      expect([delta("total", "Male"), delta("total", "Female")]).toEqual([2, 1])
    }
  }, 120000)
})
