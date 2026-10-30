import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { DiningPeriod, DiningTag, DiningTagValue } from "../../../src/models/index.js"
import { catererFixture, periodFixture, studentFixture, scanFixture, rebateFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const office = () => seed.createUser({ role: "Dining", subRole: "Office" })
const utc = (key) => new Date(`${key}T00:00:00Z`)
const utcPeriod = (caterer, from, to, extra = {}) => periodFixture(caterer, from, to, { startDate: utc(from), endDate: utc(to), ...extra })
const periodTag = (period, name, defaultValue, extra = {}) => DiningTag.create({ kind: "period", periodId: period._id, name, defaultValue, ...extra })
const standaloneTag = (name, from, to, defaultValue = null, extra = {}) => DiningTag.create({ kind: "standalone", name, startDate: utc(from), endDate: utc(to), defaultValue, ...extra })
const answer = (tag, student, value, source = "admin") => DiningTagValue.create({
  tagId: tag._id, studentUserId: student.user._id, studentProfileId: student.profile._id, rollNumber: student.profile.rollNumber, value, source,
})
// Standalone tags are global, so tests from other blocks may add tags: look up by id.
const countOf = (tagCounts, tag) => tagCounts.find((entry) => entry.id === String(tag._id))?.count
const ids = (list) => list.map((entry) => entry.id)

/** Current period (today-4 .. today+5), three students at kitchen A, one at B. */
const kitchen = async () => {
  const today = keyFor()
  const a = await catererFixture()
  const b = await catererFixture()
  const period = await utcPeriod(a.caterer, shift(today, -4), shift(today, 5), { catererIds: [a.caterer._id, b.caterer._id] })
  const [alpha, beta, gamma] = [
    await studentFixture(period, a.caterer, "Alpha Student", "A"),
    await studentFixture(period, a.caterer, "Beta Student", "B"),
    await studentFixture(period, a.caterer, "Gamma Student", "C"),
  ]
  const delta = await studentFixture(period, b.caterer, "Delta Student", "D")
  return { today, a, b, period, alpha, beta, gamma, delta, f: { period, caterer: a.caterer, date: today } }
}

describe("dining tags — allocations roster", () => {
  it("lists the period's tags and standalone tags overlapping it, with each student's values", async () => {
    const { today, a, period, alpha, beta } = await kitchen()
    const other = await utcPeriod(a.caterer, shift(today, 20), shift(today, 30))
    const jain = await periodTag(period, "Jain food", false, { question: "Jain food?" })
    const otherPeriodTag = await periodTag(other, "Other period", true)
    const archived = await periodTag(period, "Retired", true, { isArchived: true })
    const fast = await standaloneTag("Fasting", today, shift(today, 1))
    const later = await standaloneTag("Far later", shift(today, 40), shift(today, 41), true)
    await answer(jain, alpha, true, "student")
    await answer(fast, beta, false)

    const data = ok(await (await as(a.user)).get("/api/v1/dining-allocations/roster").query({ periodId: String(period._id) }))
    const tagIds = ids(data.tags)
    expect(tagIds).toEqual(expect.arrayContaining([String(jain._id), String(fast._id)]))
    expect(tagIds).not.toContain(String(otherPeriodTag._id))
    expect(tagIds).not.toContain(String(archived._id))
    expect(tagIds).not.toContain(String(later._id))
    expect(data.tags.find((tag) => tag.id === String(jain._id))).toEqual({
      id: String(jain._id), kind: "period", name: "Jain food", question: "Jain food?", defaultValue: false,
      periodId: String(period._id), startDate: shift(today, -4), endDate: shift(today, 5),
    })
    expect(data.tags.find((tag) => tag.id === String(fast._id))).toMatchObject({ kind: "standalone", startDate: today, endDate: shift(today, 1), defaultValue: null })

    const byName = Object.fromEntries(data.students.map((row) => [row.name, row]))
    expect(byName["Alpha Student"].tags[String(jain._id)]).toEqual({ value: true, effective: true, source: "student" })
    expect(byName["Alpha Student"].tags[String(fast._id)]).toEqual({ value: null, effective: null, source: null })
    expect(byName["Beta Student"].tags[String(jain._id)]).toEqual({ value: null, effective: false, source: null })
    expect(byName["Beta Student"].tags[String(fast._id)]).toEqual({ value: false, effective: false, source: "admin" })

    // Oversight sees the same.
    const all = ok(await (await as(await office())).get("/api/v1/dining-allocations/roster").query({ periodId: String(period._id) }))
    expect(all.students.find((row) => row.name === "Delta Student").tags[String(jain._id)]).toMatchObject({ effective: false })
  })
})

describe("dining tags — headcounts", () => {
  it("counts expected eaters per tag per day: period defaults, rebate days excluded, standalone ranges respected", async () => {
    const { today, a, period, alpha, beta, gamma, delta, f } = await kitchen()
    // Period tag defaults to yes: Alpha said no, Beta and Gamma inherit yes.
    const veg = await periodTag(period, "Veg", true)
    await answer(veg, alpha, false, "student")
    // Standalone tag only on today+1..today+2, default null: Alpha yes, Beta yes.
    const fast = await standaloneTag("Fast day", shift(today, 1), shift(today, 2))
    await answer(fast, alpha, true)
    await answer(fast, beta, true)
    await answer(fast, delta, true)
    // Gamma away today; Beta away on today+2.
    await rebateFixture(f, gamma, { from: today, to: today })
    await rebateFixture(f, beta, { from: shift(today, 2), to: shift(today, 2) })

    const caterer = await as(a.user)
    const overview = ok(await caterer.get("/api/v1/dining-caterer/rebates/overview").query({ from: today, to: shift(today, 6) }))
    const day = (offset) => overview.days.find((entry) => entry.date === shift(today, offset))
    expect(countOf(day(0).tagCounts, veg)).toBe(1) // Beta (Gamma on rebate)
    expect(countOf(day(1).tagCounts, veg)).toBe(2) // Beta + Gamma
    expect(countOf(day(2).tagCounts, veg)).toBe(1) // Gamma (Beta on rebate)
    expect(countOf(day(0).tagCounts, fast)).toBeUndefined()
    expect(countOf(day(1).tagCounts, fast)).toBe(2) // Alpha + Beta (Delta is another kitchen)
    expect(countOf(day(2).tagCounts, fast)).toBe(1) // Alpha
    expect(countOf(day(3).tagCounts, fast)).toBeUndefined()
    // Outside the period: no allocation tag.
    expect(countOf(day(6).tagCounts, veg)).toBeUndefined()

    const rebateDay = ok(await caterer.get("/api/v1/dining-caterer/rebates/day").query({ date: shift(today, 2) }))
    expect(rebateDay.expectedCount).toBe(2)
    expect(countOf(rebateDay.tagCounts, veg)).toBe(1)
    expect(countOf(rebateDay.tagCounts, fast)).toBe(1)

    const records = ok(await caterer.get("/api/v1/dining-caterer/meal-records/overview").query({ periodId: String(period._id), from: shift(today, -1), to: today }))
    expect(countOf(records.days.find((entry) => entry.date === today).tagCounts, veg)).toBe(1)
    expect(countOf(records.days.find((entry) => entry.date === shift(today, -1)).tagCounts, veg)).toBe(2)

    // Daily report: per caterer and totals; Delta (kitchen B) inherits Veg yes.
    const report = ok(await (await as(await office())).get("/api/v1/dining-oversight/daily-report").query({ date: shift(today, 1), periodId: String(period._id) }))
    const rowA = report.caterers.find((row) => row.id === String(a.caterer._id))
    const rowB = report.caterers.find((row) => row.id !== String(a.caterer._id))
    expect(countOf(rowA.tagCounts, veg)).toBe(2)
    expect(countOf(rowA.tagCounts, fast)).toBe(2)
    expect(countOf(rowB.tagCounts, veg)).toBe(1)
    expect(countOf(rowB.tagCounts, fast)).toBe(1)
    expect(countOf(report.totals.tagCounts, veg)).toBe(3)
    expect(countOf(report.totals.tagCounts, fast)).toBe(3)

    // Meal record summary of today.
    const meal = ok(await caterer.get("/api/v1/dining-caterer/meal-records").query({ periodId: String(period._id), date: today, mealSlotKey: "all-day" }))
    expect(countOf(meal.summary.tagCounts, veg)).toBe(1)
  })
})

describe("dining tags — scan screens", () => {
  it("adds effective-yes tags of the scan day to feeds, manual verify, available students and meal records", async () => {
    // Scans resolve "the" active period: retire the periods earlier tests left running.
    await DiningPeriod.updateMany({}, { isArchived: true })
    const { today, a, period, alpha, beta, f } = await kitchen()
    const jain = await periodTag(period, "Jain", false)
    const vip = await standaloneTag("Guest night", today, today, true)
    const tomorrowOnly = await standaloneTag("Tomorrow only", shift(today, 1), shift(today, 1), true)
    await answer(jain, alpha, true, "student")
    await answer(vip, beta, false)

    await scanFixture(f, beta, { date: today, time: "08:00:00" })
    const caterer = await as(a.user)

    const tagIdsOf = (student) => ids(student.tags)
    const verify = await caterer.post("/api/v1/dining-meal-verification/manual").send({ rollNumber: alpha.profile.rollNumber })
    expect(verify.status, JSON.stringify(verify.body)).toBe(201)
    const verifiedTags = tagIdsOf(verify.body.data.verification.student)
    expect(verifiedTags).toEqual(expect.arrayContaining([String(jain._id), String(vip._id)]))
    expect(verifiedTags).not.toContain(String(tomorrowOnly._id))
    expect(verify.body.data.verification.student.tags.find((tag) => tag.id === String(jain._id))).toEqual({ id: String(jain._id), name: "Jain" })

    const feed = ok(await caterer.get("/api/v1/dining-meal-verification/feed"))
    const feedBy = (student) => feed.entries.find((entry) => entry.rollNumber === student.profile.rollNumber)
    expect(tagIdsOf(feedBy(alpha).student)).toEqual(expect.arrayContaining([String(jain._id), String(vip._id)]))
    expect(tagIdsOf(feedBy(beta).student)).not.toContain(String(jain._id))
    expect(tagIdsOf(feedBy(beta).student)).not.toContain(String(vip._id))

    const available = ok(await caterer.get("/api/v1/dining-meal-verification/available-students"))
    const availBy = (student) => available.students.find((row) => row.rollNumber === student.profile.rollNumber)
    expect(tagIdsOf(availBy(alpha).student)).toContain(String(jain._id))
    expect(tagIdsOf(availBy(beta).student)).not.toContain(String(vip._id))

    const oversightFeed = ok(await (await as(await office())).get("/api/v1/dining-oversight/feed").query({ date: today, catererId: String(a.caterer._id) }))
    const alphaEntry = oversightFeed.entries.find((entry) => entry.rollNumber === alpha.profile.rollNumber)
    expect(tagIdsOf(alphaEntry.student)).toEqual(expect.arrayContaining([String(jain._id), String(vip._id)]))

    const records = ok(await caterer.get("/api/v1/dining-caterer/meal-records").query({ periodId: String(period._id), date: today, mealSlotKey: "all-day" }))
    const rowBy = (student) => records.students.find((row) => row.student.rollNumber === student.profile.rollNumber)
    expect(tagIdsOf(rowBy(alpha).student)).toEqual(expect.arrayContaining([String(jain._id), String(vip._id)]))
    expect(tagIdsOf(rowBy(beta).student)).not.toContain(String(vip._id))
    const oversightRecords = ok(await (await as(await seed.admin())).get("/api/v1/dining-oversight/meal-records").query({ periodId: String(period._id), date: today, mealSlotKey: "all-day" }))
    expect(oversightRecords.students.find((row) => row.student.rollNumber === alpha.profile.rollNumber).student.tags.map((tag) => tag.id)).toContain(String(jain._id))
  })
})
