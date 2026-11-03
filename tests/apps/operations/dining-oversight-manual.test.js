import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { Caterer, DiningAllocation, DiningPeriod, StudentProfile } from "../../../src/models/index.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const URL = "/api/v1/dining-oversight/manual"
let n = 0
const caterer = async (name) => {
  const user = await seed.createUser({ role: "Dining", subRole: "Caterer", name: `${name} Manager` })
  const row = await Caterer.create({ name, email: `manual-${++n}-${Date.now().toString(36)}@hms.test`, userId: user._id })
  return { user, caterer: row }
}
const student = async (period, kitchen) => {
  const user = await seed.student()
  const profile = await StudentProfile.create({
    userId: user._id, rollNumber: `MAN${Date.now().toString(36)}${++n}`.toUpperCase(),
    degree: "B.Tech", department: "CSE", gender: "Male", status: "Active",
  })
  if (kitchen) {
    await DiningAllocation.create({ periodId: period._id, studentUserId: user._id, studentProfileId: profile._id, rollNumber: profile.rollNumber, catererId: kitchen._id })
  }
  return profile
}

describe("dining oversight — manual check-in from the live feed", () => {
  it("records at the student's own caterer, or at the one picked, and refuses caterer logins", async () => {
    const a = await caterer("Manual Alpha")
    const b = await caterer("Manual Beta")
    const period = await DiningPeriod.create({
      startDate: new Date(Date.now() - 86400_000), endDate: new Date(Date.now() + 86400_000),
      catererIds: [a.caterer._id, b.caterer._id],
      mealSlots: [{ name: "All Day Meal", startTime: "00:00", endTime: "23:59" }],
    })
    const atB = await student(period, b.caterer)
    const nowhere = await student(period, null)

    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    const admin = await as(await seed.createUser({ role: "Admin" }))

    // No caterer picked: goes to B, where the student is allocated.
    let res = await office.post(URL).send({ rollNumber: atB.rollNumber.toLowerCase() })
    expect(res.status, JSON.stringify(res.body)).toBe(201)
    expect(res.body.data.verification.status).toBe("verified")
    expect(res.body.data.verification.source).toBe("manual")
    expect(String(res.body.data.verification.catererId?._id || res.body.data.verification.catererId)).toBe(String(b.caterer._id))

    // Again: a duplicate, like at the machine.
    res = await admin.post(URL).send({ rollNumber: atB.rollNumber })
    expect(res.body.data.verification.status).toBe("duplicate")

    // Caterer A picked: recorded at A as the wrong caterer.
    res = await admin.post(URL).send({ rollNumber: atB.rollNumber, catererId: String(a.caterer._id) })
    expect(res.status).toBe(201)
    expect(res.body.data.verification.status).toBe("wrong-caterer")

    // Nobody to record it against.
    res = await office.post(URL).send({ rollNumber: nowhere.rollNumber })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/no caterer/i)
    res = await office.post(URL).send({ rollNumber: "NOSUCHROLL" })
    expect(res.status).toBe(400)
    res = await office.post(URL).send({})
    expect(res.status).toBe(400)

    // Caterer logins use their own endpoint.
    res = await (await as(a.user)).post(URL).send({ rollNumber: atB.rollNumber })
    expect(res.status).toBe(403)
  })
})
