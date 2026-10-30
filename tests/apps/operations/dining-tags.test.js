/**
 * Dining Tags management (/api/v1/dining-tags) + allocation tags on the
 * admin dining-period payload.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
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

const BASE = "/api/v1/dining-tags"
let adminApi
let admin

beforeAll(async () => {
  await setupTestDb()
  admin = await seed.admin()
  adminApi = await as(admin)
})
afterAll(teardownTestDb)

const ok = (res, status = 200) => {
  expect(res.status, JSON.stringify(res.body)).toBe(status)
  expect(res.body.success).toBe(true)
  return res.body.data
}
const bad = (res, message) => {
  expect(res.status, JSON.stringify(res.body)).toBe(400)
  if (message) expect(res.body.message).toBe(message)
}

let seq = 0
const standalone = (extra = {}) => ({
  name: `Tag ${++seq}`,
  startDate: dayKey(utcDay(0)),
  endDate: dayKey(utcDay(5)),
  defaultValue: null,
  ...extra,
})

const student = async (rollNumber, extra = {}) => {
  const user = await seed.student({ name: `Student ${rollNumber}` })
  const profile = await createStudentProfile({ userId: user._id, rollNumber, ...extra })
  return { user, profile }
}

describe("dining tags — authorization", () => {
  it("requires a session", async () => {
    expect((await (await anon()).get(BASE)).status).toBe(401)
  })
  it("grants Admin and Dining Office, refuses caterers and students", async () => {
    ok(await adminApi.get(BASE))
    const office = await seed.createUser({ role: "Dining", subRole: "Office" })
    ok(await (await as(office)).get(BASE))
    const caterer = await seed.createUser({ role: "Dining", subRole: "Caterer" })
    expect((await (await as(caterer)).get(BASE)).status).toBe(403)
    expect((await (await as(await seed.student())).get(BASE)).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningTags"] } } })
    expect((await (await as(denied)).get(BASE)).status).toBe(403)
  })
})

describe("dining tags — standalone CRUD", () => {
  it("validates the payload", async () => {
    bad(await adminApi.post(BASE).send(standalone({ name: "  " })), "Name is required")
    bad(await adminApi.post(BASE).send(standalone({ name: "x".repeat(61) })), "Name must be at most 60 characters")
    bad(await adminApi.post(BASE).send(standalone({ startDate: "" })), "Start date and end date are required (YYYY-MM-DD)")
    bad(await adminApi.post(BASE).send(standalone({ startDate: dayKey(utcDay(3)), endDate: dayKey(utcDay(1)) })), "Start date must be on or before end date")
    bad(await adminApi.post(BASE).send(standalone({ defaultValue: "yes" })), "Default value must be yes, no or none")
    bad(await adminApi.post(BASE).send(standalone({ form: { enabled: true } })), "Form open and close times are required")
    const now = Date.now()
    bad(await adminApi.post(BASE).send(standalone({ form: { enabled: true, opensAt: new Date(now + 1000), closesAt: new Date(now) } })), "Form must open before it closes")
    bad(await adminApi.post(BASE).send(standalone({ form: { enabled: true, opensAt: new Date(now), closesAt: new Date(now + 1000), audience: "custom", rollNumbers: [] } })), "Add at least one roll number for a custom audience")
    bad(await adminApi.post(BASE).send(standalone({ form: { audience: "everyone" } })), "Form audience must be all-active or custom")
    bad(await adminApi.post(BASE).send(standalone({ kind: "period" })), "Allocation tags are created from the dining period form")
  })

  it("creates, lists, updates, enforces unique names and archives", async () => {
    const opensAt = new Date(Date.now() - 60_000).toISOString()
    const closesAt = new Date(Date.now() + 3_600_000).toISOString()
    const created = ok(await adminApi.post(BASE).send(standalone({
      name: "Jain Food", question: "Do you eat Jain food?", defaultValue: false,
      form: { enabled: true, opensAt, closesAt, audience: "custom", rollNumbers: ["jt001", " JT002 ", "JT001"] },
    })), 201)
    expect(created).toMatchObject({
      kind: "standalone", name: "Jain Food", question: "Do you eat Jain food?", periodId: null, period: null,
      startDate: dayKey(utcDay(0)), endDate: dayKey(utcDay(5)), defaultValue: false, isArchived: false,
      counts: { yes: 0, no: 0, answered: 0 },
    })
    expect(created.form).toMatchObject({ enabled: true, audience: "custom", rollNumbers: ["JT001", "JT002"], isOpen: true })

    bad(await adminApi.post(BASE).send(standalone({ name: "jain food" })), 'A tag named "jain food" already exists')

    const list = ok(await adminApi.get(BASE).query({ kind: "standalone" }))
    expect(list.map((tag) => tag.id)).toContain(created.id)

    const updated = ok(await adminApi.put(`${BASE}/${created.id}`).send(standalone({ name: "Jain Food", defaultValue: true, endDate: dayKey(utcDay(9)) })))
    expect(updated).toMatchObject({ id: created.id, defaultValue: true, endDate: dayKey(utcDay(9)), form: { enabled: false, isOpen: false } })

    const archived = ok(await adminApi.put(`${BASE}/${created.id}/archive`).send({ isArchived: true }))
    expect(archived.isArchived).toBe(true)
    expect(ok(await adminApi.get(BASE)).map((tag) => tag.id)).not.toContain(created.id)
    expect(ok(await adminApi.get(BASE).query({ archived: "true" })).map((tag) => tag.id)).toContain(created.id)
    bad(await adminApi.put(`${BASE}/${created.id}/archive`).send({ isArchived: "no" }), "isArchived must be true or false")

    // The name is free again once archived; restoring the old one then clashes.
    ok(await adminApi.post(BASE).send(standalone({ name: "JAIN FOOD" })), 201)
    bad(await adminApi.put(`${BASE}/${created.id}/archive`).send({ isArchived: false }), 'A live tag named "Jain Food" already exists')

    expect((await adminApi.put(`${BASE}/000000000000000000000000`).send(standalone())).status).toBe(404)
    bad(await adminApi.put(`${BASE}/nope`).send(standalone()), "Invalid tag")
  })
})

describe("dining tags — student values", () => {
  it("sets / clears single values, lists the roster with counts and filters", async () => {
    const tag = ok(await adminApi.post(BASE).send(standalone({ name: "Late dinner", defaultValue: true, form: { enabled: false, audience: "custom", rollNumbers: ["VAL001", "VAL002", "VAL003"] } })), 201)
    const a = await student("VAL001")
    const b = await student("VAL002")
    await student("VAL003")
    const outsider = await student("VAL009")

    const row = ok(await adminApi.put(`${BASE}/${tag.id}/students/${a.user._id}`).send({ value: false }))
    expect(row).toMatchObject({ studentUserId: String(a.user._id), rollNumber: "VAL001", value: false, effective: false, source: "admin" })
    ok(await adminApi.put(`${BASE}/${tag.id}/students/${b.user._id}`).send({ value: true }))
    // Outside the audience is allowed for the office; joins the roster.
    ok(await adminApi.put(`${BASE}/${tag.id}/students/${outsider.user._id}`).send({ value: true }))
    bad(await adminApi.put(`${BASE}/${tag.id}/students/${a.user._id}`).send({ value: "maybe" }), "value must be true, false or null")
    expect((await adminApi.put(`${BASE}/${tag.id}/students/000000000000000000000000`).send({ value: true })).status).toBe(404)

    const stored = await DiningTagValue.findOne({ tagId: tag.id, studentUserId: a.user._id }).lean()
    expect(stored).toMatchObject({ value: false, source: "admin", rollNumber: "VAL001" })
    expect(String(stored.updatedBy)).toBe(String(admin._id))

    let roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`))
    expect(roster.counts).toEqual({ yes: 2, no: 1, unanswered: 1, total: 4 })
    expect(roster.items.map((item) => item.rollNumber)).toEqual(["VAL001", "VAL002", "VAL003", "VAL009"])
    expect(roster.items[2]).toMatchObject({ value: null, effective: true, source: null })

    roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`).query({ value: "unanswered" }))
    expect(roster.items.map((item) => item.rollNumber)).toEqual(["VAL003"])
    roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`).query({ value: "yes", search: "val00" }))
    expect(roster).toMatchObject({ total: 2, page: 1, limit: 50 })
    roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`).query({ page: 2, limit: 3 }))
    expect(roster.items.map((item) => item.rollNumber)).toEqual(["VAL009"])
    bad(await adminApi.get(`${BASE}/${tag.id}/students`).query({ value: "maybe" }), "value must be yes, no or unanswered")

    const cleared = ok(await adminApi.put(`${BASE}/${tag.id}/students/${a.user._id}`).send({ value: null }))
    expect(cleared).toMatchObject({ value: null, effective: true, source: null })
    const tags = ok(await adminApi.get(BASE).query({ kind: "standalone" }))
    expect(tags.find((item) => item.id === tag.id).counts).toEqual({ yes: 2, no: 0, answered: 2 })
  })

  it("all-active roster lists answered students; an exact roll search finds others", async () => {
    const tag = ok(await adminApi.post(BASE).send(standalone({ name: "Roster all" })), 201)
    const a = await student("ALL001")
    await student("ALL002")
    ok(await adminApi.put(`${BASE}/${tag.id}/students/${a.user._id}`).send({ value: true }))
    let roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`))
    expect(roster.items.map((item) => item.rollNumber)).toEqual(["ALL001"])
    expect(roster.counts.yes).toBe(1)
    expect(roster.counts.total).toBeGreaterThanOrEqual(2)
    roster = ok(await adminApi.get(`${BASE}/${tag.id}/students`).query({ search: "all002" }))
    expect(roster.items).toHaveLength(1)
    expect(roster.items[0]).toMatchObject({ rollNumber: "ALL002", value: null })
  })

  it("bulk upload reports skip reasons and records csv as the source", async () => {
    const tag = ok(await adminApi.post(BASE).send(standalone({ name: "Bulk tag" })), 201)
    const a = await student("BLK001")
    const b = await student("BLK002")
    const data = ok(await adminApi.post(`${BASE}/${tag.id}/students/bulk`).send({
      entries: [
        { rollNumber: "blk001", value: true },
        { rollNumber: "BLK002", value: "no" },
        { rollNumber: "BLK001", value: false },
        { rollNumber: "", value: true },
        { rollNumber: "BLK003", value: "perhaps" },
        { rollNumber: "NOPE99", value: true },
      ],
    }))
    expect(data.updated).toBe(2)
    expect(data.skipped).toEqual([
      { rollNumber: "BLK001", reason: "Duplicate roll number" },
      { rollNumber: "", reason: "Missing roll number" },
      { rollNumber: "BLK003", reason: "Invalid value" },
      { rollNumber: "NOPE99", reason: "Student not found" },
    ])
    const rows = await DiningTagValue.find({ tagId: tag.id }).lean()
    expect(rows.map((row) => [String(row.studentUserId), row.value, row.source]).sort()).toEqual(
      [[String(a.user._id), true, "csv"], [String(b.user._id), false, "csv"]].sort()
    )
    bad(await adminApi.post(`${BASE}/${tag.id}/students/bulk`).send({ entries: [] }), "entries must be a non-empty list")
    bad(await adminApi.post(`${BASE}/${tag.id}/students/bulk`).send({ entries: Array.from({ length: 5001 }, () => ({ rollNumber: "X", value: true })) }), "At most 5000 entries are allowed per upload")
  })
})

describe("dining tags — allocation (period) tags", () => {
  let caterer
  let period
  let inPeriod
  let notInPeriod

  beforeAll(async () => {
    await archiveLiveDiningPeriods()
    caterer = await createCaterer({ name: "Tag Mess" })
    const payload = {
      startDate: utcDay(2), endDate: utcDay(12), registrationEnabled: false, dailyRate: 100,
      eligibilityMode: "all-active", mealSlots: [{ name: "Dinner", startTime: "19:00", endTime: "22:00" }],
      catererIds: [String(caterer._id)], catererCapacities: [{ catererId: String(caterer._id), maxStudentCount: 50 }],
    }
    bad(await adminApi.post("/api/v1/admin/dining-periods").send({ ...payload, tags: [{ name: "Veg" }] }), 'Choose a default (yes or no) for tag "Veg"')
    bad(await adminApi.post("/api/v1/admin/dining-periods").send({ ...payload, tags: [{ name: "Veg", defaultValue: true }, { name: "veg", defaultValue: false }] }), 'Tag names must be unique within a period ("veg")')
    bad(await adminApi.post("/api/v1/admin/dining-periods").send({ ...payload, tags: [{ name: "", defaultValue: true }] }), "Each tag needs a name")
    const created = ok(await adminApi.post("/api/v1/admin/dining-periods").send({
      ...payload, tags: [{ name: "Veg", question: "Vegetarian?", defaultValue: true }, { name: "Jain", defaultValue: false }],
    }), 201)
    expect(created.tags.map((tag) => [tag.name, tag.question, tag.defaultValue])).toEqual([["Veg", "Vegetarian?", true], ["Jain", "", false]])
    expect(created.tags[0].counts).toEqual({ yes: 0, no: 0, answered: 0 })
    period = created
    inPeriod = await student("PER001")
    notInPeriod = await student("PER002")
    await createDiningAllocation({ periodId: period.id, studentUserId: inPeriod.user._id, studentProfileId: inPeriod.profile._id, rollNumber: "PER001", catererId: caterer._id })
  })

  it("lists period tags with the period's dates; editing them here is refused", async () => {
    const tags = ok(await adminApi.get(BASE).query({ kind: "period", periodId: period.id }))
    expect(tags.map((tag) => tag.name)).toEqual(["Veg", "Jain"])
    expect(tags[0]).toMatchObject({ kind: "period", periodId: period.id, period: { id: period.id, startDate: dayKey(utcDay(2)), endDate: dayKey(utcDay(12)) }, startDate: dayKey(utcDay(2)), endDate: dayKey(utcDay(12)) })
    bad(await adminApi.put(`${BASE}/${tags[0].id}`).send(standalone()), "Allocation tags are edited from the dining period form")
  })

  it("restricts values to students allocated in the period", async () => {
    const [veg] = ok(await adminApi.get(BASE).query({ kind: "period", periodId: period.id }))
    bad(await adminApi.put(`${BASE}/${veg.id}/students/${notInPeriod.user._id}`).send({ value: true }), "This student is not allocated in the tag's dining period")
    ok(await adminApi.put(`${BASE}/${veg.id}/students/${inPeriod.user._id}`).send({ value: false }))
    const bulk = ok(await adminApi.post(`${BASE}/${veg.id}/students/bulk`).send({ entries: [{ rollNumber: "PER001", value: true }, { rollNumber: "PER002", value: true }] }))
    expect(bulk).toEqual({ updated: 1, skipped: [{ rollNumber: "PER002", reason: "Not allocated in this period" }] })
    const roster = ok(await adminApi.get(`${BASE}/${veg.id}/students`))
    expect(roster.items.map((item) => [item.rollNumber, item.value, item.source])).toEqual([["PER001", true, "csv"]])
    expect(roster.counts).toEqual({ yes: 1, no: 0, unanswered: 0, total: 1 })
  })

  it("period update syncs tags: update by id, create new, archive missing (answers kept); omitted leaves them", async () => {
    // GET /admin/dining-periods answers with the bare array (no envelope).
    const res = await adminApi.get("/api/v1/admin/dining-periods")
    expect(res.status).toBe(200)
    const listed = res.body
    const current = listed.find((item) => item.id === period.id)
    expect(current.tags.map((tag) => tag.name)).toEqual(["Veg", "Jain"])
    expect(current.tags[0].counts).toEqual({ yes: 1, no: 0, answered: 1 })
    const [veg, jain] = current.tags
    const base = {
      startDate: current.startDate, endDate: current.endDate, registrationEnabled: false, dailyRate: 100,
      eligibilityMode: "all-active", mealSlots: current.mealSlots, catererIds: current.catererIds.map(String),
      catererCapacities: current.catererCapacities.map((entry) => ({ catererId: entry.catererId, maxStudentCount: entry.maxStudentCount })),
    }
    bad(await adminApi.put(`/api/v1/admin/dining-periods/${period.id}`).send({ ...base, tags: [{ id: "000000000000000000000000", name: "Ghost", defaultValue: true }] }), 'Tag "Ghost" does not belong to this period')

    const updated = ok(await adminApi.put(`/api/v1/admin/dining-periods/${period.id}`).send({
      ...base, tags: [{ id: veg.id, name: "Vegetarian", defaultValue: false }, { name: "No onion", defaultValue: false }],
    }))
    expect(updated.tags.map((tag) => [tag.name, tag.defaultValue])).toEqual([["Vegetarian", false], ["No onion", false]])
    expect(updated.tags[0].id).toBe(veg.id)
    expect(updated.tags[0].counts.answered).toBe(1)
    const archivedJain = await DiningTag.findById(jain.id).lean()
    expect(archivedJain.isArchived).toBe(true)

    const untouched = ok(await adminApi.put(`/api/v1/admin/dining-periods/${period.id}`).send(base))
    expect(untouched.tags.map((tag) => tag.name)).toEqual(["Vegetarian", "No onion"])

    // Reviving an archived tag by id.
    const revived = ok(await adminApi.put(`/api/v1/admin/dining-periods/${period.id}`).send({ ...base, tags: [{ id: jain.id, name: "Jain", defaultValue: true }] }))
    expect(revived.tags.map((tag) => tag.id)).toEqual([jain.id])
    expect(await DiningTagValue.countDocuments({ tagId: veg.id })).toBe(1)
  })
})
