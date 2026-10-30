/**
 * Student-side dining tags: caterer-selection answers, GET /tags, PUT /tags/:tagId.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  utcDay,
  dayKey,
  createStudentProfile,
  createCaterer,
  createDiningPeriod,
  createDiningAllocation,
  archiveLiveDiningPeriods,
} from "../../helpers/seed/students.js"
import { DiningTag, DiningTagValue } from "../../../src/models/index.js"

const BASE = "/api/v1/students/dining"
const HOUR = 60 * 60 * 1000

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const ok = (res) => {
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const bad = (res, message) => {
  expect(res.status, JSON.stringify(res.body)).toBe(400)
  if (message) expect(res.body.message).toBe(message)
}
const student = async (rollNumber, extra = {}) => {
  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id, rollNumber, ...extra })
  return { user, profile, api: await as(user) }
}
const periodTag = (period, name, defaultValue, order = 0) =>
  DiningTag.create({ kind: "period", periodId: period._id, name, question: `${name}?`, defaultValue, order })

describe("caterer selection answers", () => {
  let caterer
  let period
  let veg
  let jain

  beforeAll(async () => {
    await archiveLiveDiningPeriods()
    caterer = await createCaterer({ name: "Answer Mess" })
    period = await createDiningPeriod({
      startDate: utcDay(3), endDate: utcDay(12),
      catererIds: [caterer._id], catererCapacities: [{ catererId: caterer._id, maxStudentCount: 50, allocatedCount: 0 }],
    })
    veg = await periodTag(period, "Veg", true, 0)
    jain = await periodTag(period, "Jain", false, 1)
    await DiningTag.create({ kind: "period", periodId: period._id, name: "Old", defaultValue: true, isArchived: true })
  })

  it("portal lists the open period's live tags", async () => {
    const { api } = await student("ANS001")
    const portal = ok(await api.get(`${BASE}/portal`))
    expect(portal.activeAllocationPeriod.tags).toEqual([
      { id: String(veg._id), name: "Veg", question: "Veg?" },
      { id: String(jain._id), name: "Jain", question: "Jain?" },
    ])
    expect(portal.currentPeriod).toBeNull()
  })

  it("select requires an answer for every tag, then saves them as the student's", async () => {
    const { api, user } = await student("ANS002")
    bad(await api.post(`${BASE}/select`).send({ catererId: String(caterer._id) }), "Please answer: Veg, Jain")
    bad(await api.post(`${BASE}/select`).send({
      catererId: String(caterer._id), tagAnswers: [{ tagId: String(veg._id), value: true }, { tagId: String(jain._id), value: "yes" }],
    }), "Please answer: Jain")
    ok(await api.post(`${BASE}/select`).send({
      catererId: String(caterer._id),
      tagAnswers: [{ tagId: String(veg._id), value: false }, { tagId: String(jain._id), value: true }, { tagId: "000000000000000000000000", value: true }],
    }))
    const rows = await DiningTagValue.find({ studentUserId: user._id }).sort({ value: 1 }).lean()
    expect(rows.map((row) => [String(row.tagId), row.value, row.source])).toEqual([
      [String(veg._id), false, "student"],
      [String(jain._id), true, "student"],
    ])
  })

  it("GET /tags shows the answers, editable until the period's first day", async () => {
    const { api, user } = await student("ANS003")
    ok(await api.post(`${BASE}/select`).send({
      catererId: String(caterer._id), tagAnswers: [{ tagId: String(veg._id), value: true }, { tagId: String(jain._id), value: false }],
    }))
    const { items } = ok(await api.get(`${BASE}/tags`))
    expect(items).toHaveLength(2)
    const start = new Date(period.startDate)
    const localMidnight = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
    expect(items[0]).toMatchObject({
      tagId: String(veg._id), kind: "period", name: "Veg", value: true, effective: true, defaultValue: true,
      editable: true, editableUntil: localMidnight.toISOString(),
      period: { id: String(period._id), startDate: dayKey(period.startDate), endDate: dayKey(period.endDate) },
      startDate: dayKey(period.startDate), endDate: dayKey(period.endDate),
    })
    const changed = ok(await api.put(`${BASE}/tags/${jain._id}`).send({ value: true }))
    expect(changed).toMatchObject({ tagId: String(jain._id), value: true, effective: true, editable: true })
    expect((await DiningTagValue.findOne({ tagId: jain._id, studentUserId: user._id }).lean()).source).toBe("student")
    bad(await api.put(`${BASE}/tags/${jain._id}`).send({ value: "yes" }), "Answer yes or no")
  })

  it("refuses answers for periods the student is not allocated in", async () => {
    const { api } = await student("ANS004")
    bad(await api.put(`${BASE}/tags/${veg._id}`).send({ value: true }), "You are not allocated in this dining period")
    expect(ok(await api.get(`${BASE}/tags`)).items).toEqual([])
  })
})

describe("tags of a running period", () => {
  it("are listed but no longer editable", async () => {
    await archiveLiveDiningPeriods()
    const caterer = await createCaterer({ name: "Running Mess" })
    const period = await createDiningPeriod({
      startDate: utcDay(-2), endDate: utcDay(5), registrationEnabled: false,
      catererIds: [caterer._id], catererCapacities: [{ catererId: caterer._id, maxStudentCount: 5 }],
    })
    const tag = await periodTag(period, "Spicy", false)
    const { api, user, profile } = await student("RUN001")
    await createDiningAllocation({ periodId: period._id, studentUserId: user._id, studentProfileId: profile._id, rollNumber: "RUN001", catererId: caterer._id })
    const { items } = ok(await api.get(`${BASE}/tags`))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ tagId: String(tag._id), value: null, effective: false, editable: false })
    bad(await api.put(`${BASE}/tags/${tag._id}`).send({ value: true }), "Answers can no longer be changed once the dining period has started")
  })

  it("select without tagAnswers still works when the period has no tags", async () => {
    await archiveLiveDiningPeriods()
    const caterer = await createCaterer({ name: "Plain Mess" })
    await createDiningPeriod({
      startDate: utcDay(3), endDate: utcDay(8),
      catererIds: [caterer._id], catererCapacities: [{ catererId: caterer._id, maxStudentCount: 5, allocatedCount: 0 }],
    })
    const { api } = await student("PLN001")
    const portal = ok(await api.get(`${BASE}/portal`))
    expect(portal.activeAllocationPeriod.tags).toEqual([])
    ok(await api.post(`${BASE}/select`).send({ catererId: String(caterer._id) }))
  })
})

describe("standalone tag forms", () => {
  const form = (extra = {}) => ({
    enabled: true, opensAt: new Date(Date.now() - HOUR), closesAt: new Date(Date.now() + HOUR), audience: "all-active", rollNumbers: [], ...extra,
  })
  const standalone = (name, extra = {}) => DiningTag.create({
    kind: "standalone", name, startDate: utcDay(0), endDate: utcDay(4), defaultValue: null, form: form(), ...extra,
  })

  it("shows open forms to students in the audience only", async () => {
    await archiveLiveDiningPeriods()
    await DiningTag.updateMany({}, { $set: { isArchived: true } })
    const everyone = await standalone("Everyone")
    const custom = await standalone("Custom", { form: form({ audience: "custom", rollNumbers: ["AUD001"] }) })
    await standalone("Closed", { form: form({ closesAt: new Date(Date.now() - 60_000) }) })
    await standalone("Not yet", { form: form({ opensAt: new Date(Date.now() + HOUR), closesAt: new Date(Date.now() + 2 * HOUR) }) })
    await standalone("No form", { form: { enabled: false } })
    await standalone("Archived", { isArchived: true })

    const inList = await student("AUD001")
    const items = ok(await inList.api.get(`${BASE}/tags`)).items
    expect(items.map((item) => item.name).sort()).toEqual(["Custom", "Everyone"])
    const item = items.find((entry) => entry.name === "Everyone")
    expect(item).toMatchObject({ kind: "standalone", value: null, effective: null, editable: true, startDate: dayKey(utcDay(0)), endDate: dayKey(utcDay(4)) })
    expect(item.period).toBeUndefined()
    expect(item.editableUntil).toBe(new Date(everyone.form.closesAt).toISOString())

    const saved = ok(await inList.api.put(`${BASE}/tags/${custom._id}`).send({ value: true }))
    expect(saved).toMatchObject({ value: true, effective: true })

    const other = await student("AUD002")
    expect(ok(await other.api.get(`${BASE}/tags`)).items.map((entry) => entry.name)).toEqual(["Everyone"])
    bad(await other.api.put(`${BASE}/tags/${custom._id}`).send({ value: true }), "This form is not open for you")
    ok(await other.api.put(`${BASE}/tags/${everyone._id}`).send({ value: false }))

    const inactive = await student("AUD003", { status: "Inactive" })
    expect(ok(await inactive.api.get(`${BASE}/tags`)).items).toEqual([])
    bad(await inactive.api.put(`${BASE}/tags/${everyone._id}`).send({ value: true }), "This form is not open for you")

    const closed = await DiningTag.findOne({ name: "Closed" }).lean()
    bad(await other.api.put(`${BASE}/tags/${closed._id}`).send({ value: true }), "This form is not open")
    const archived = await DiningTag.findOne({ name: "Archived" }).lean()
    expect((await other.api.put(`${BASE}/tags/${archived._id}`).send({ value: true })).status).toBe(404)
  })
})
