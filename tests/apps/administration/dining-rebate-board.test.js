/**
 * Rebate board (Admin + Dining Office): rebates by dining period, office-side
 * create / edit / archive / restore, and archived rebates counting nowhere.
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

const BASE = "/api/v1/admin/dining-rebates/board"
const keys = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => dayKey(utcDay(from + i)))
const day = (offset) => dayKey(utcDay(offset))

let adminApi
let officeApi
let caterer
let current
let next
let rollSeq = 0

const newStudent = async (name) => {
  const user = await seed.student({ name: name || `Board Student ${rollSeq + 1}` })
  const rollNumber = `RBB${String(++rollSeq).padStart(3, "0")}`
  const profile = await createStudentProfile({ userId: user._id, rollNumber })
  return { user, profile, rollNumber, api: await as(user) }
}

const allocate = (student, period) => createDiningAllocation({
  periodId: period._id,
  studentUserId: student.user._id,
  studentProfileId: student.profile._id,
  rollNumber: student.rollNumber,
  catererId: caterer._id,
})

const seedRebate = async (student, { from, to, type = "short-term", status = "approved" }) => {
  const { DiningRebate } = await import("../../../src/models/index.js")
  const dateKeys = keys(from, to)
  return DiningRebate.create({
    requestGroupId: `board-${student.rollNumber}-${from}-${to}`,
    studentUserId: student.user._id,
    studentProfileId: student.profile._id,
    rollNumber: student.rollNumber,
    startDate: utcDay(from),
    endDate: utcDay(to),
    dateKeys,
    dayCount: dateKeys.length,
    type,
    status,
  })
}

beforeAll(async () => {
  await setupTestDb()
  await archiveLiveDiningPeriods()
  adminApi = await as(await seed.admin())
  officeApi = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))
  caterer = await createCaterer()
  // current: day -5 … +4; next: +5 … +14 (no overlap, no choice windows).
  current = await createDiningPeriod({ startDate: utcDay(-5), endDate: utcDay(4), catererIds: [caterer._id], allocationStartAt: null, allocationEndAt: null, registrationEnabled: false })
  next = await createDiningPeriod({ startDate: utcDay(5), endDate: utcDay(14), catererIds: [caterer._id], allocationStartAt: null, allocationEndAt: null, registrationEnabled: false })
})

afterAll(async () => {
  await teardownTestDb()
})

describe("access", () => {
  it("401 anonymous, 403 student, 200 admin and Dining Office", async () => {
    expect((await (await anon()).get(`${BASE}/overview`)).status).toBe(401)
    const student = await newStudent()
    expect((await student.api.get(`${BASE}/overview`)).status).toBe(403)
    expect((await adminApi.get(`${BASE}/overview`)).status).toBe(200)
    expect((await officeApi.get(`${BASE}/list`)).status).toBe(200)
  })
})

describe("by dining period", () => {
  let spanning
  let inside
  let later

  beforeAll(async () => {
    const a = await newStudent("Asha Spanning")
    const b = await newStudent("Bina Inside")
    const c = await newStudent("Chetan Later")
    await allocate(a, current)
    await allocate(a, next)
    await allocate(b, current)
    spanning = await seedRebate(a, { from: 2, to: 8, type: "long-term" })        // 3 days in current, 4 in next
    inside = await seedRebate(b, { from: -2, to: -1 })                           // current only
    later = await seedRebate(c, { from: 30, to: 31, status: "pending" })         // in no period
  })

  it("defaults to the running period and lists the periods for the picker", async () => {
    const res = await adminApi.get(`${BASE}/overview`)
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.period.id).toBe(String(current._id))
    expect(data.period.phase).toBe("current")
    expect(data.periods.map((p) => p.id)).toEqual([String(next._id), String(current._id)])
    expect(data.stats.approved).toBe(2)
    expect(data.stats.crossing).toBe(1)
    expect(data.stats.approvedDays).toBe(3 + 2)
    expect(data.daily).toHaveLength(10)
    expect(data.daily.find((d) => d.date === day(-2)).approved).toBe(1)
    expect(data.daily.find((d) => d.date === day(3)).approved).toBe(1)
  })

  it("a rebate spanning two periods appears in both, with its placements", async () => {
    const cur = await adminApi.get(`${BASE}/list`).query({ periodId: String(current._id) })
    const nxt = await adminApi.get(`${BASE}/list`).query({ periodId: String(next._id) })
    const curIds = cur.body.data.items.map((r) => String(r.id))
    const nxtIds = nxt.body.data.items.map((r) => String(r.id))
    expect(curIds).toEqual([String(inside._id), String(spanning._id)])
    expect(nxtIds).toEqual([String(spanning._id)])
    const item = cur.body.data.items.find((r) => String(r.id) === String(spanning._id))
    expect(item.placements.map((p) => p.dayCount)).toEqual([3, 4])
    expect(item.source).toBe("student")
  })

  it("'outside' shows rebates whose days are in no period", async () => {
    const res = await adminApi.get(`${BASE}/list`).query({ periodId: "outside" })
    expect(res.body.data.scope).toBe("outside")
    expect(res.body.data.items.map((r) => String(r.id))).toEqual([String(later._id)])
  })

  it("filters by status, type, day and search; paginates", async () => {
    const q = (query) => adminApi.get(`${BASE}/list`).query({ periodId: String(current._id), ...query })
    expect((await q({ type: "long-term" })).body.data.items).toHaveLength(1)
    expect((await q({ day: day(-2) })).body.data.items.map((r) => String(r.id))).toEqual([String(inside._id)])
    expect((await q({ search: "bina" })).body.data.items.map((r) => String(r.id))).toEqual([String(inside._id)])
    expect((await q({ search: "RBB" })).body.data.total).toBe(2)
    const page2 = await q({ limit: 1, page: 2 })
    expect(page2.body.data.total).toBe(2)
    expect(page2.body.data.items.map((r) => String(r.id))).toEqual([String(spanning._id)])
    expect((await q({ status: "pending" })).body.data.items).toHaveLength(0)
  })
})

describe("office create", () => {
  it("searches students with what confirms them (caterer in the period, live rebates)", async () => {
    const s = await newStudent("Deepa Searchable")
    await allocate(s, current)
    await seedRebate(s, { from: 0, to: 1 })
    const res = await officeApi.get(`${BASE}/students`).query({ search: "deepa", periodId: String(current._id) })
    expect(res.status).toBe(200)
    const [item] = res.body.data.items
    expect(item.rollNumber).toBe(s.rollNumber)
    expect(item.allocation.caterer).toBe(caterer.name)
    expect(item.rebates).toHaveLength(1)
  })

  it("previews per student (conflicts block, rule breaks only warn) and creates one row per student", async () => {
    const free = await newStudent()
    const busy = await newStudent()
    await allocate(free, current)
    await seedRebate(busy, { from: 1, to: 1 })

    const preview = await officeApi.post(`${BASE}/preview`).send({ studentUserIds: [String(free.user._id), String(busy.user._id)], startDate: day(-1), endDate: day(1), type: "short-term" })
    expect(preview.status).toBe(200)
    const plan = preview.body.data.plan
    expect(plan.blocked).toBe(true)
    expect(plan.students.find((s) => s.rollNumber === busy.rollNumber).conflicts).toHaveLength(1)
    // past start date is fine for the office; busy has no caterer → warning, not a block
    expect(plan.students.find((s) => s.rollNumber === busy.rollNumber).warnings.join(" ")).toMatch(/no caterer/)

    const blocked = await officeApi.post(BASE).send({ studentUserIds: [String(free.user._id), String(busy.user._id)], startDate: day(-1), endDate: day(1) })
    expect(blocked.status).toBe(409)

    const other = await newStudent()
    const created = await officeApi.post(BASE).send({ studentUserIds: [String(free.user._id), String(other.user._id)], startDate: day(-1), endDate: day(6), type: "long-term", reason: "Sports meet", status: "approved" })
    expect(created.status).toBe(201)
    const rebates = created.body.data.rebates
    expect(rebates).toHaveLength(2)
    expect(new Set(rebates.map((r) => r.requestGroupId)).size).toBe(1)
    expect(rebates.every((r) => r.status === "approved" && r.type === "long-term" && r.dayCount === 8 && r.source === "office")).toBe(true)
    expect(rebates[0].people.createdBy.id).toBeTruthy()

    // The student sees it in their portal
    const mine = await free.api.get("/api/v1/students/dining/rebates")
    expect(mine.body.data.rebates.some((r) => r.reason === "Sports meet")).toBe(true)
  })
})

describe("office edit, archive, restore", () => {
  it("edits dates/type/status/message, logs history, and blocks overlaps", async () => {
    const s = await newStudent()
    await allocate(s, current)
    const rebate = await seedRebate(s, { from: 1, to: 2 })
    await seedRebate(s, { from: 10, to: 11 })

    const clash = await adminApi.put(`${BASE}/${rebate._id}`).send({ startDate: day(1), endDate: day(10) })
    expect(clash.status).toBe(409)

    const res = await adminApi.put(`${BASE}/${rebate._id}`).send({ startDate: day(0), endDate: day(6), type: "long-term", status: "pending", reason: "Home visit", adminComment: "Corrected dates", note: "Called the student" })
    expect(res.status).toBe(200)
    const edited = res.body.data.rebate
    expect(edited.dayCount).toBe(7)
    expect(edited.dateKeys).toEqual(keys(0, 6))
    expect(edited.status).toBe("pending")
    expect(edited.type).toBe("long-term")
    expect(edited.reason).toBe("Home visit")
    expect(edited.placements.map((p) => p.dayCount)).toEqual([5, 2])
    expect(edited.people.lastEditedBy.id).toBeTruthy()

    const history = await adminApi.get(`${BASE}/${rebate._id}/history`)
    expect(history.status).toBe(200)
    const [entry] = history.body.data.items
    expect(entry.action).toBe("update")
    expect(entry.reason).toBe("Called the student")
    expect(entry.actor.isSystem).toBe(false)
    expect(entry.actor.id).toBe(edited.people.lastEditedBy.id)
    expect(entry.changes.map((c) => c.field)).toEqual(expect.arrayContaining(["startDate", "endDate", "status", "type"]))
  })

  it("archived rebates count nowhere and can be restored unless a live rebate took their days", async () => {
    const s = await newStudent()
    await allocate(s, current)
    const rebate = await seedRebate(s, { from: 3, to: 3 })

    const archived = await officeApi.put(`${BASE}/${rebate._id}/archive`).send({ reason: "Duplicate" })
    expect(archived.status).toBe(200)
    expect(archived.body.data.rebate.archivedAt).toBeTruthy()
    expect(archived.body.data.rebate.archiveReason).toBe("Duplicate")

    // Gone for the student, in the archived view for the office
    const mine = await s.api.get("/api/v1/students/dining/rebates")
    expect(mine.body.data.rebates.map((r) => String(r.id))).not.toContain(String(rebate._id))
    const list = await officeApi.get(`${BASE}/list`).query({ periodId: String(current._id), status: "archived", search: s.rollNumber })
    expect(list.body.data.items.map((r) => String(r.id))).toEqual([String(rebate._id)])
    const live = await officeApi.get(`${BASE}/list`).query({ periodId: String(current._id), search: s.rollNumber })
    expect(live.body.data.items).toHaveLength(0)
    expect(live.body.data.counts.archived).toBe(1)

    // Can't edit or approve while archived
    expect((await officeApi.put(`${BASE}/${rebate._id}`).send({ reason: "x" })).status).toBe(400)

    // Its day is free again: a new rebate takes it, so restore is refused
    const replacement = await officeApi.post(BASE).send({ studentUserIds: [String(s.user._id)], startDate: day(3), endDate: day(3) })
    expect(replacement.status).toBe(201)
    expect((await officeApi.put(`${BASE}/${rebate._id}/restore`)).status).toBe(409)

    await officeApi.put(`${BASE}/${replacement.body.data.rebates[0].id}/archive`).send({})
    const restored = await officeApi.put(`${BASE}/${rebate._id}/restore`)
    expect(restored.status).toBe(200)
    expect(restored.body.data.rebate.archivedAt).toBeNull()

    const history = await officeApi.get(`${BASE}/${rebate._id}/history`)
    expect(history.body.data.items.map((i) => i.action)).toEqual(["restore", "delete"])
  })

  it("approve/reject on the old queue skip archived rebates and are logged", async () => {
    const s = await newStudent()
    const rebate = await seedRebate(s, { from: 20, to: 25, type: "long-term", status: "pending" })
    const approved = await adminApi.put(`/api/v1/admin/dining-rebates/${rebate._id}/approve`)
    expect(approved.status).toBe(200)
    const history = await adminApi.get(`${BASE}/${rebate._id}/history`)
    expect(history.body.data.items[0].changes).toEqual([{ field: "status", from: "pending", to: "approved" }])
    expect(history.body.data.items[0].actor.isSystem).toBe(false)

    const other = await seedRebate(s, { from: 40, to: 45, type: "long-term", status: "pending" })
    await adminApi.put(`${BASE}/${other._id}/archive`).send({})
    expect((await adminApi.put(`/api/v1/admin/dining-rebates/${other._id}/approve`)).status).toBe(404)
    const pending = await adminApi.get("/api/v1/admin/dining-rebates").query({ status: "pending" })
    expect(pending.body.data.rebates.map((r) => String(r.id))).not.toContain(String(other._id))
  })
})
