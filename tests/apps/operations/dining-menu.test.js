/**
 * Dining menu: management (/api/v1/dining-menu), the caterer's own menu
 * (/api/v1/caterer/menu, /api/v1/dining-caterer/menu) and the student menu
 * (/api/v1/students/dining/menu).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { catererFixture, keyFor, shift } from "../../helpers/seed/dining-caterer.js"
import { Caterer, DiningAllocation, DiningMenuDay, DiningMenuWeek, DiningPeriod, StudentProfile } from "../../../src/models/index.js"

const BASE = "/api/v1/dining-menu"
let adminApi
let today

beforeAll(async () => {
  await setupTestDb()
  adminApi = await as(await seed.admin())
  today = keyFor()
})
afterAll(teardownTestDb)

const ok = (res, status = 200) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const bad = (res, pattern) => {
  expect(res.status, JSON.stringify(res.body)).toBe(400)
  if (pattern) expect(res.body.message).toMatch(pattern)
}

let seq = 0
// Caterer.userId is unique+sparse with default null, and sparse still indexes
// null: give each test kitchen its own (login-less) userId so they never collide.
const kitchen = async (name) => Caterer.create({
  name: name || `Kitchen ${++seq}`,
  email: `kitchen-${Date.now()}-${++seq}@hms.test`,
  userId: new mongoose.Types.ObjectId(),
})
const weekdayOf = (key) => new Date(`${key}T00:00:00Z`).getUTCDay()
const item = (name, diet = "veg", special = false) => ({ name, diet, special })
/** Every weekday: Breakfast + Lunch with the given lunch items. */
const fullWeek = (lunch, breakfast = [item("Poha")]) =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, meals: [{ name: "Breakfast", items: breakfast }, { name: "Lunch", items: lunch, note: "" }] }))
const period = (caterers, from, to, extra = {}) => DiningPeriod.create({
  startDate: new Date(`${from}T00:00:00`), endDate: new Date(`${to}T23:59:59.999`),
  catererIds: caterers.map((caterer) => caterer._id),
  mealSlots: [
    { name: "Breakfast", startTime: "07:30", endTime: "09:30" },
    { name: "Lunch", startTime: "12:00", endTime: "14:00" },
    { name: "Dinner", startTime: "19:30", endTime: "21:30" },
  ],
  ...extra,
})
const menuOf = (caterer, from, to) => adminApi.get(BASE).query({ catererId: String(caterer._id), from, to })
const dayOf = (data, date) => data.days.find((day) => day.date === date)
const mealOf = (day, name) => day.meals.find((meal) => meal.name === name)

describe("dining menu — authorization", () => {
  it("requires a session", async () => {
    expect((await (await anon()).get(`${BASE}/caterers`)).status).toBe(401)
  })
  it("grants Admin and Dining Office, refuses caterers, students and denied office", async () => {
    ok(await adminApi.get(`${BASE}/caterers`))
    ok(await (await as(await seed.createUser({ role: "Dining", subRole: "Office" }))).get(`${BASE}/caterers`))
    const { user } = await catererFixture()
    const catererApi = await as(user)
    expect((await catererApi.get(`${BASE}/caterers`)).status).toBe(403)
    expect((await catererApi.put(`${BASE}/week`).send({})).status).toBe(403)
    expect((await (await as(await seed.student())).get(`${BASE}/caterers`)).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningMenu"] } } })
    expect((await (await as(denied)).get(`${BASE}/caterers`)).status).toBe(403)
  })
})

describe("dining menu — caterers and ranges", () => {
  it("lists caterers, active first", async () => {
    const archived = await kitchen("AAA Archived")
    await Caterer.updateOne({ _id: archived._id }, { isArchived: true })
    const active = await kitchen("ZZZ Active")
    const { caterers } = ok(await adminApi.get(`${BASE}/caterers`))
    const ids = caterers.map((row) => row.id)
    expect(caterers.find((row) => row.id === String(archived._id))).toMatchObject({ name: "AAA Archived", isActive: false })
    expect(ids.indexOf(String(active._id))).toBeLessThan(ids.indexOf(String(archived._id)))
  })
  it("rejects ranges over 62 days and from > to", async () => {
    const caterer = await kitchen()
    bad(await menuOf(caterer, today, shift(today, 62)), /62 days/)
    ok(await menuOf(caterer, today, shift(today, 61)))
    bad(await menuOf(caterer, shift(today, 1), today), /on or before/)
    bad(await adminApi.get(BASE).query({ catererId: "nope" }), /catererId/)
  })
})

describe("dining menu — weekly versions", () => {
  it("resolves the version in effect on each day across a version boundary", async () => {
    const caterer = await kitchen()
    const pastFrom = shift(today, -10)
    await DiningMenuWeek.create({ catererId: caterer._id, effectiveFrom: pastFrom, days: fullWeek([item("Old Dal")]) })
    const nextFrom = shift(today, 3)
    const { version } = ok(await adminApi.put(`${BASE}/week`).send({
      catererId: String(caterer._id), effectiveFrom: nextFrom, days: fullWeek([item("New Dal", "veg", true)]), note: "Winter menu",
    }))
    expect(version).toMatchObject({ effectiveFrom: nextFrom, note: "Winter menu", isCurrent: false, isScheduled: true })
    expect(version.updatedBy).toMatchObject({ id: expect.any(String) })

    const data = ok(await menuOf(caterer, shift(today, -11), shift(today, 6)))
    expect(data.caterer).toEqual({ id: String(caterer._id), name: caterer.name })
    expect(data.today).toBe(today)
    expect(data.days).toHaveLength(18)
    const before = dayOf(data, shift(today, -11))
    expect(mealOf(before, "Lunch")).toMatchObject({ source: "none", items: [], weekFrom: null })
    const past = dayOf(data, shift(today, -1))
    expect(past).toMatchObject({ isPast: true, isToday: false, weekday: weekdayOf(shift(today, -1)), periodId: null })
    expect(mealOf(past, "Lunch")).toMatchObject({ source: "week", weekFrom: pastFrom, items: [item("Old Dal")], changed: false, served: true })
    expect(dayOf(data, today)).toMatchObject({ isPast: false, isToday: true })
    expect(mealOf(dayOf(data, shift(today, 2)), "Lunch").items[0].name).toBe("Old Dal")
    expect(mealOf(dayOf(data, nextFrom), "Lunch")).toMatchObject({ weekFrom: nextFrom, items: [item("New Dal", "veg", true)] })
    // No period: meals come from the menu data, in Breakfast/Lunch order.
    expect(dayOf(data, nextFrom).meals.map((meal) => meal.name)).toEqual(["Breakfast", "Lunch"])
    expect(before.meals.map((meal) => meal.name)).toEqual(["Breakfast", "Lunch", "Dinner"])

    const { versions } = ok(await adminApi.get(`${BASE}/versions`).query({ catererId: String(caterer._id) }))
    expect(versions.map((row) => [row.effectiveFrom, row.isCurrent, row.isScheduled])).toEqual([
      [nextFrom, false, true],
      [pastFrom, true, false],
    ])
    // Saving the same effectiveFrom replaces that version.
    ok(await adminApi.put(`${BASE}/week`).send({ catererId: String(caterer._id), effectiveFrom: nextFrom, days: fullWeek([item("Rajma")]) }))
    expect(await DiningMenuWeek.countDocuments({ catererId: caterer._id })).toBe(2)
  })

  it("validates versions: past, too far ahead, bad items", async () => {
    const caterer = await kitchen()
    const send = (extra) => adminApi.put(`${BASE}/week`).send({ catererId: String(caterer._id), effectiveFrom: today, days: fullWeek([item("Rice")]), ...extra })
    bad(await send({ effectiveFrom: shift(today, -1) }), /past/)
    bad(await send({ effectiveFrom: shift(today, 200) }), /6 months/)
    bad(await send({ days: fullWeek([item("x".repeat(81))]) }), /80 characters/)
    bad(await send({ days: fullWeek([item("Rice", "vegan")]) }), /diet/)
    bad(await send({ days: fullWeek(Array.from({ length: 41 }, (_, i) => item(`I${i}`))) }), /40 items/)
    bad(await send({ days: [{ weekday: 7, meals: [] }] }), /weekday/)
    bad(await send({ days: [{ weekday: 1, meals: [{ name: "Lunch" }, { name: " lunch " }] }] }), /twice/)
    ok(await send({}))
  })

  it("deletes scheduled versions only", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    ok(await adminApi.put(`${BASE}/week`).send({ catererId, effectiveFrom: today, days: fullWeek([item("Rice")]) }))
    ok(await adminApi.put(`${BASE}/week`).send({ catererId, effectiveFrom: shift(today, 7), days: fullWeek([item("Roti")]) }))
    bad(await adminApi.delete(`${BASE}/week`).query({ catererId, effectiveFrom: today }), /scheduled/)
    ok(await adminApi.delete(`${BASE}/week`).query({ catererId, effectiveFrom: shift(today, 7) }))
    expect((await adminApi.delete(`${BASE}/week`).query({ catererId, effectiveFrom: shift(today, 7) })).status).toBe(404)
    expect(await DiningMenuWeek.countDocuments({ catererId: caterer._id })).toBe(1)
  })

  it("copies the version in effect to other kitchens", async () => {
    const source = await kitchen()
    const targetA = await kitchen()
    const targetB = await kitchen()
    await DiningMenuWeek.create({ catererId: source._id, effectiveFrom: shift(today, -3), days: fullWeek([item("Copied Curry", "nonveg")]), note: "Shared" })
    const body = { fromCatererId: String(source._id), toCatererIds: [String(targetA._id), String(targetB._id), String(source._id)], effectiveFrom: shift(today, 1) }
    expect(ok(await adminApi.post(`${BASE}/copy`).send(body))).toEqual({ copied: 2 })
    const { versions } = ok(await adminApi.get(`${BASE}/versions`).query({ catererId: String(targetB._id) }))
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({ effectiveFrom: shift(today, 1), note: "Shared", isScheduled: true })
    expect(versions[0].days[0].meals[1]).toEqual({ name: "Lunch", items: [item("Copied Curry", "nonveg")], note: "" })
    bad(await adminApi.post(`${BASE}/copy`).send({ ...body, effectiveFrom: shift(today, -1) }), /past/)
    const empty = await kitchen()
    bad(await adminApi.post(`${BASE}/copy`).send({ ...body, fromCatererId: String(empty._id) }), /no weekly menu/)
  })
})

describe("dining menu — date overrides", () => {
  it("override wins over the weekly menu; changed only when it differs", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    ok(await adminApi.put(`${BASE}/week`).send({ catererId, effectiveFrom: today, days: fullWeek([item("Dal"), item("Rice")]) }))
    const d1 = shift(today, 1)
    const d2 = shift(today, 2)
    const same = ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [d1], meals: [{ name: "lunch", items: [item("Dal"), item("Rice")] }] }))
    expect(same.days).toHaveLength(1)
    expect(mealOf(same.days[0], "Lunch")).toMatchObject({ source: "date", changed: false, weekFrom: today })
    const changed = ok(await adminApi.put(`${BASE}/dates`).send({
      catererId, dates: [d2, d1], meals: [{ name: "Lunch", items: [item("Biryani", "nonveg", true)], note: "Festival" }],
    }))
    expect(changed.days.map((day) => day.date)).toEqual([d1, d2])
    for (const day of changed.days) {
      expect(mealOf(day, "Lunch")).toMatchObject({ source: "date", changed: true, note: "Festival", items: [item("Biryani", "nonveg", true)] })
      expect(mealOf(day, "Breakfast")).toMatchObject({ source: "week", changed: false })
    }
    // Empty items is still an override ("nothing listed").
    const blank = ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [today], meals: [{ name: "Breakfast", items: [] }] }))
    expect(mealOf(blank.days[0], "Breakfast")).toMatchObject({ source: "date", items: [], changed: true })
    // A meal not in the weekly menu becomes a listed meal (no period).
    const extra = ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [d1], meals: [{ name: "Snacks", items: [item("Samosa")] }] }))
    expect(extra.days[0].meals.map((meal) => [meal.name, meal.source])).toEqual([["Breakfast", "week"], ["Lunch", "date"], ["Snacks", "date"]])
  })

  it("refuses past and far-future dates", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    const meals = [{ name: "Lunch", items: [item("Rice")] }]
    bad(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [today, shift(today, -1)], meals }), /past/)
    bad(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [shift(today, 200)], meals }), /6 months/)
    bad(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [today], meals: [] }), /at least one meal/)
    bad(await adminApi.delete(`${BASE}/dates`).send({ catererId, dates: [shift(today, -1)] }), /past/)
    expect(await DiningMenuDay.countDocuments({ catererId: caterer._id })).toBe(0)
  })

  it("resets one meal or all meals; empty documents are deleted", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    ok(await adminApi.put(`${BASE}/week`).send({ catererId, effectiveFrom: today, days: fullWeek([item("Dal")]) }))
    const d = shift(today, 4)
    ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [d], meals: [{ name: "Breakfast", items: [item("Idli")] }, { name: "Lunch", items: [item("Pulao")] }] }))
    const one = ok(await adminApi.delete(`${BASE}/dates`).send({ catererId, dates: [d], mealNames: ["LUNCH"] }))
    expect(mealOf(one.days[0], "Lunch")).toMatchObject({ source: "week", items: [item("Dal")] })
    expect(mealOf(one.days[0], "Breakfast")).toMatchObject({ source: "date", items: [item("Idli")] })
    ok(await adminApi.delete(`${BASE}/dates`).send({ catererId, dates: [d], mealNames: ["Breakfast"] }))
    expect(await DiningMenuDay.countDocuments({ catererId: caterer._id })).toBe(0)
    ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [d, shift(d, 1)], meals: [{ name: "Lunch", items: [] }] }))
    const all = ok(await adminApi.delete(`${BASE}/dates`).send({ catererId, dates: [d, shift(d, 1)] }))
    expect(all.days.every((day) => day.meals.every((meal) => meal.source === "week"))).toBe(true)
    expect(await DiningMenuDay.countDocuments({ catererId: caterer._id })).toBe(0)
  })
})

describe("dining menu — items autocomplete", () => {
  it("lists distinct names, prefix first, then most used, with the remembered diet", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    ok(await adminApi.put(`${BASE}/week`).send({
      catererId, effectiveFrom: today,
      days: [0, 1, 2].map((weekday) => ({ weekday, meals: [{ name: "Lunch", items: [item("Qx Paneer Tikka", "veg"), item("Egg Qx Curry", "egg")] }] })),
    }))
    ok(await adminApi.put(`${BASE}/dates`).send({ catererId, dates: [today], meals: [{ name: "Dinner", items: [item("qx paneer tikka", ""), item("Egg Qx Curry", "egg")] }, { name: "Lunch", items: [item("Egg Qx Curry", "egg")] }] }))
    const { items } = ok(await adminApi.get(`${BASE}/items`).query({ q: "qx" }))
    expect(items).toEqual([
      { name: expect.stringMatching(/qx paneer tikka/i), diet: "veg", uses: 4 },
      { name: "Egg Qx Curry", diet: "egg", uses: 5 },
    ])
    expect(ok(await adminApi.get(`${BASE}/items`).query({ q: "qx", limit: "1" })).items).toHaveLength(1)
    bad(await adminApi.get(`${BASE}/items`).query({ limit: "0" }), /limit/)
  })
})

describe("dining menu — meal slots from the period", () => {
  it("uses the period's meals and timings; closed meals are not served", async () => {
    const caterer = await kitchen()
    const catererId = String(caterer._id)
    const closedDay = shift(today, 2)
    const p = await period([caterer], shift(today, -2), shift(today, 5), {
      weekSchedule: [{ weekday: weekdayOf(closedDay), slots: [{ name: "dinner", closed: true }, { name: "Lunch", startTime: "12:30", endTime: "14:30" }] }],
    })
    ok(await adminApi.put(`${BASE}/week`).send({ catererId, effectiveFrom: today, days: fullWeek([item("Dal")]) }))
    const data = ok(await menuOf(caterer, today, shift(today, 7)))
    const open = dayOf(data, today)
    expect(open.periodId).toBe(String(p._id))
    expect(open.meals.map((meal) => [meal.name, meal.startTime, meal.endTime, meal.served, meal.source])).toEqual([
      ["Breakfast", "07:30", "09:30", true, "week"],
      ["Lunch", "12:00", "14:00", true, "week"],
      ["Dinner", "19:30", "21:30", true, "none"],
    ])
    const closed = dayOf(data, closedDay)
    expect(mealOf(closed, "Dinner")).toMatchObject({ served: false })
    expect(mealOf(closed, "Lunch")).toMatchObject({ startTime: "12:30", endTime: "14:30", served: true })
    // Outside the period: meal names from the menu data, no times.
    expect(dayOf(data, shift(today, 6))).toMatchObject({ periodId: null })
    expect(mealOf(dayOf(data, shift(today, 6)), "Lunch")).toMatchObject({ startTime: null, endTime: null, served: true })
  })
})

describe("dining menu — caterer own kitchen", () => {
  it("returns the logged-in caterer's own menu only", async () => {
    const { user, caterer } = await catererFixture()
    const other = await kitchen()
    ok(await adminApi.put(`${BASE}/week`).send({ catererId: String(caterer._id), effectiveFrom: today, days: fullWeek([item("Mine")]) }))
    ok(await adminApi.put(`${BASE}/week`).send({ catererId: String(other._id), effectiveFrom: today, days: fullWeek([item("Theirs")]) }))
    const api = await as(user)
    for (const path of ["/api/v1/caterer/menu", "/api/v1/dining-caterer/menu"]) {
      const data = ok(await api.get(path).query({ from: today, to: shift(today, 6), catererId: String(other._id) }))
      expect(data.caterer).toEqual({ id: String(caterer._id), name: caterer.name })
      expect(data.today).toBe(today)
      expect(data.days).toHaveLength(7)
      expect(mealOf(data.days[0], "Lunch").items).toEqual([item("Mine")])
    }
    bad(await api.get("/api/v1/caterer/menu").query({ from: today, to: shift(today, 62) }), /62 days/)
    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
    expect((await office.get("/api/v1/caterer/menu")).status).toBe(403)
    const denied = await catererFixture({ authz: { override: { denyRoutes: ["route.caterer.menu"] } } })
    expect((await (await as(denied.user)).get("/api/v1/caterer/menu")).status).toBe(403)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))).get("/api/v1/caterer/menu")).status).toBe(404)
  })
})

describe("dining menu — student", () => {
  const STUDENT = "/api/v1/students/dining/menu"
  const student = async (rollNumber) => {
    const user = await seed.student({ name: `Student ${rollNumber}` })
    const profile = await StudentProfile.create({ userId: user._id, rollNumber, degree: "B.Tech", department: "CSE", batch: "2025", gender: "Male", status: "Active" })
    return { user, profile }
  }
  const allocate = (p, caterer, s) => DiningAllocation.create({
    periodId: p._id, catererId: caterer._id, studentUserId: s.user._id, studentProfileId: s.profile._id, rollNumber: s.profile.rollNumber,
  })

  it("uses the student's allocated caterer per date", async () => {
    await DiningPeriod.updateMany({}, { isArchived: true })
    const a = await kitchen("Kitchen A")
    const b = await kitchen("Kitchen B")
    await DiningMenuWeek.create({ catererId: a._id, effectiveFrom: shift(today, -30), days: fullWeek([item("A Lunch")]) })
    await DiningMenuWeek.create({ catererId: b._id, effectiveFrom: shift(today, -30), days: fullWeek([item("B Lunch")]) })
    const p1 = await period([a, b], shift(today, -5), shift(today, 2))
    const p2 = await period([a, b], shift(today, 3), shift(today, 10))
    const s = await student("MENU-S1")
    await allocate(p1, a, s)
    await allocate(p2, b, s)
    const data = ok(await (await as(s.user)).get(STUDENT).query({ from: shift(today, -6), to: shift(today, 11) }))
    expect(data.today).toBe(today)
    expect(data.caterer).toBeUndefined()
    expect(dayOf(data, shift(today, -6))).toMatchObject({ caterer: null, periodId: null, meals: [] })
    expect(dayOf(data, shift(today, -2))).toMatchObject({ caterer: { id: String(a._id), name: "Kitchen A" }, periodId: String(p1._id), isPast: true })
    expect(mealOf(dayOf(data, today), "Lunch").items).toEqual([item("A Lunch")])
    expect(dayOf(data, shift(today, 4))).toMatchObject({ caterer: { id: String(b._id) }, periodId: String(p2._id) })
    expect(mealOf(dayOf(data, shift(today, 4)), "Lunch").items).toEqual([item("B Lunch")])
    expect(dayOf(data, shift(today, 11)).meals).toEqual([])

    // Not allocated: the period's meals with no items.
    const lone = await student("MENU-S2")
    await allocate(p2, a, lone)
    const other = ok(await (await as(lone.user)).get(STUDENT).query({ from: today, to: shift(today, 4) }))
    const unallocated = dayOf(other, today)
    expect(unallocated).toMatchObject({ caterer: null, periodId: String(p1._id) })
    expect(unallocated.meals.map((meal) => [meal.name, meal.source, meal.items.length])).toEqual([["Breakfast", "none", 0], ["Lunch", "none", 0], ["Dinner", "none", 0]])
    expect(dayOf(other, shift(today, 4)).caterer).toMatchObject({ id: String(a._id) })

    bad(await (await as(s.user)).get(STUDENT).query({ from: today, to: shift(today, 62) }), /62 days/)
  })
})
