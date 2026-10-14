import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { DiningAllocation } from "../../../src/models/index.js"
import { fixture, scanFixture, rebateFixture, removeAllocationFixture, shift } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const url = "/api/v1/students/dining/meals"

describe("student dining — my meals", () => {
  it("needs a student session", async () => {
    expect((await (await anon()).get(url)).status).toBe(401)
    expect((await (await as(await seed.admin())).get(url)).status).toBe(403)
  })

  it("shows today and the last two weeks: ate, missed, away, and why a scan failed", async () => {
    const f = await fixture()
    const [me, other] = f.students
    await DiningAllocation.collection.updateMany({ periodId: f.period._id }, { $set: { createdAt: new Date(`${shift(f.today, -15)}T00:00:00`) } })
    await scanFixture(f, me, { date: f.date, time: "12:10:00" })
    await scanFixture(f, me, { date: f.date, time: "13:00:00", status: "wrong-caterer", mealSlotKey: "lunch", mealSlotName: "Lunch" })
    await rebateFixture(f, me, { from: shift(f.today, -2) })
    await scanFixture(f, other, { date: f.date })

    const data = (await (await as(me.user)).get(url)).body.data
    expect(data.caterer).toMatchObject({ id: String(f.caterer._id), name: f.caterer.name })
    expect(data.period.id).toBe(String(f.period._id))
    expect(data.days).toHaveLength(14)
    expect(data.days.at(-1).date).toBe(f.today)
    const yesterday = data.days.find((day) => day.date === f.date)
    expect(yesterday.meals["all-day"]).toMatchObject({ status: "ate", source: "manual" })
    expect(yesterday.meals.lunch).toMatchObject({ status: "missed", issue: "wrong-caterer" })
    const awayDay = data.days.find((day) => day.date === shift(f.today, -2))
    expect(awayDay).toMatchObject({ away: true, meals: { "all-day": { status: "away" }, lunch: { status: "away" } } })
    expect(data.summary).toMatchObject({ ate: 1, away: 2 })
    expect(data.todayMeals.map((meal) => meal.key)).toEqual(["all-day", "lunch"])
    expect(data.todayMeals[0]).toMatchObject({ name: "All Day", state: "serving", status: "serving" })
  })

  it("counts only from when the student joined their caterer", async () => {
    const f = await fixture()
    const data = (await (await as(f.students[0].user)).get(url)).body.data
    expect(data.days.map((day) => day.date)).toEqual([f.today])
  })

  it("returns no period for a student without a caterer", async () => {
    const f = await fixture()
    await removeAllocationFixture(f.students[1])
    const data = (await (await as(f.students[1].user)).get(url)).body.data
    expect(data).toMatchObject({ period: null, caterer: null, days: [], todayMeals: [] })
  })
})
