import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { fixture, studentFixture, scanFixture, rebateFixture, shift } from "../../helpers/seed/dining-caterer.js"
import { referenceDay } from "../../../src/apps/students/modules/dining/dining.menu-turnout.service.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)
const url = "/api/v1/students/dining/menu"

const menuDay = async (student, date) => {
  const res = await (await as(student.user)).get(url).query({ from: date, to: date })
  expect(res.status).toBe(200)
  return res.body.data.days[0]
}
const mealOf = (day, name) => day.meals.find((meal) => meal.name === name)

/** The 4-student fixture plus two more, so the roster clears the minimum of 5. */
const sixStudents = async () => {
  const f = await fixture()
  f.students.push(await studentFixture(f.period, f.caterer, "Epsilon Student", "E"))
  f.students.push(await studentFixture(f.period, f.caterer, "Zeta Student", "Z"))
  return f
}

describe("student menu — last week's turnout per meal", () => {
  it("picks the same weekday last week, stepping back further for days a week or more ahead", () => {
    expect(referenceDay("2026-11-21", "2026-11-21")).toBe("2026-11-14")
    expect(referenceDay("2026-11-27", "2026-11-21")).toBe("2026-11-20")
    expect(referenceDay("2026-11-28", "2026-11-21")).toBe("2026-11-14")
    expect(referenceDay("2026-11-10", "2026-11-21")).toBe("2026-11-03")
  })

  it("shares of expected students who ate: rebates leave the roster, other statuses and duplicates don't count", async () => {
    const f = await sixStudents()
    const ref = shift(f.today, -7)
    const [a, b, c, d] = f.students
    await scanFixture(f, a, { date: ref })
    await scanFixture(f, a, { date: ref, time: "13:00:00" }) // a second scan is still one student
    await scanFixture(f, b, { date: ref })
    await scanFixture(f, c, { date: ref })
    await scanFixture(f, d, { date: ref, status: "duplicate" })
    // Away on an approved rebate: off the roster, even though they were scanned.
    await rebateFixture(f, f.students[5], { from: ref })
    await scanFixture(f, f.students[5], { date: ref })

    const day = await menuDay(a, f.today)
    // 3 of the 5 expected students.
    expect(mealOf(day, "All Day").lastWeek).toEqual({ date: ref, percent: 60 })
    // Nobody scanned for lunch: no figure rather than 0%.
    expect(mealOf(day, "Lunch").lastWeek).toBeNull()

    // A day ahead uses its own weekday last week.
    await scanFixture(f, a, { date: shift(f.today, -6) })
    const tomorrow = await menuDay(a, shift(f.today, 1))
    expect(mealOf(tomorrow, "All Day").lastWeek).toEqual({ date: shift(f.today, -6), percent: 17 })
  })

  it("gives no figure when too few students were expected", async () => {
    const f = await fixture()
    const ref = shift(f.today, -7)
    for (const student of f.students) await scanFixture(f, student, { date: ref })
    const day = await menuDay(f.students[0], f.today)
    expect(mealOf(day, "All Day").lastWeek).toBeNull()
  })
})
