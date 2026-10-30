import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { DiningAllocation, DiningPeriod, RoomAllocation, StudentProfile } from "../../../src/models/index.js"
import { emailService } from "../../../src/services/email/email.service.js"
import { LOCK_NOT_ACQUIRED } from "../../../src/services/lock/distributedLock.js"
import {
  findStudentsWhoMissedMeals, sendMissedMealsDigest, runDueMissedMealsDigest,
} from "../../../src/apps/operations/modules/dining-caterer/dining-missed-meals-digest.service.js"
import { seedHostelSupervisorProfile } from "../../helpers/seed/admin-sw.js"
import { catererFixture, periodFixture, studentFixture, scanFixture, rebateFixture, roomFixture, shift, keyFor } from "../../helpers/seed/dining-caterer.js"

beforeAll(setupTestDb)
afterAll(teardownTestDb)

const utc = (key) => new Date(`${key}T00:00:00Z`)
// Allocated `days` before the reported day began (fixtures are created "now").
const allocatedSince = (student, key) =>
  DiningAllocation.collection.updateOne({ _id: student.allocation._id }, { $set: { createdAt: new Date(`${key}T00:00:00`) } })

/**
 * Reported day D = yesterday. Kitchen A and B, period today-12 .. today+5.
 * Hostel H1: alpha (no meal D, D-1, D-2; last meal D-3 → 3), beta (rebate D-1, last meal D-2 → 1),
 * gamma (ate on D at kitchen B → not listed), zeta (rebate on D → not listed),
 * eta (allocated today → not listed for D). Hostel H2: delta (never ate, allocated since D-4 → 5).
 * No hostel: nomad (missed, but nobody is emailed).
 */
const scenario = async () => {
  await DiningPeriod.updateMany({}, { isArchived: true })
  const today = keyFor()
  const day = shift(today, -1)
  const a = await catererFixture()
  const b = await catererFixture()
  const period = await periodFixture(a.caterer, shift(today, -12), shift(today, 5), {
    startDate: utc(shift(today, -12)), endDate: utc(shift(today, 5)), catererIds: [a.caterer._id, b.caterer._id],
  })
  const fa = { period, caterer: a.caterer, date: day }
  const fb = { period, caterer: b.caterer, date: day }
  const make = async (name, prefix, since = shift(today, -12)) => {
    const student = await studentFixture(period, a.caterer, name, prefix)
    await allocatedSince(student, since)
    return student
  }
  const alpha = await make("Alpha Student", "A")
  const beta = await make("Beta Student", "B")
  const gamma = await make("Gamma Student", "C")
  const zeta = await make("Zeta Student", "Z")
  const eta = await studentFixture(period, a.caterer, "Eta Student", "E")
  const delta = await make("Delta Student", "D", shift(day, -4))
  const nomad = await make("Nomad Student", "N")

  const h1 = await roomFixture(alpha)
  const shared = await RoomAllocation.findOne({ userId: alpha.user._id }).lean()
  for (const [index, student] of [beta, gamma, zeta, eta].entries()) {
    const own = await RoomAllocation.create({ ...shared, _id: undefined, userId: student.user._id, studentProfileId: student.profile._id, bedNumber: index + 2 })
    await StudentProfile.updateOne({ _id: student.profile._id }, { currentRoomAllocation: own._id })
  }
  const h2 = await roomFixture(delta)
  const h3 = await roomFixture(await studentFixture(period, b.caterer, "Elsewhere Student", "X"))

  await scanFixture(fa, alpha, { date: shift(day, -3) })
  await scanFixture(fa, alpha, { date: day, status: "wrong-caterer" }) // not a verified meal
  await scanFixture(fa, beta, { date: shift(day, -2) })
  await rebateFixture(fa, beta, { from: shift(day, -1), to: shift(day, -1) })
  await scanFixture(fb, gamma, { date: day }) // ate at the other kitchen: still eating
  await rebateFixture(fa, zeta, { from: day, to: day })

  const s1 = await seedHostelSupervisorProfile({ hostels: [h1] })
  const s2 = await seedHostelSupervisorProfile({ hostels: [h1], activeHostel: h2 })
  const s3 = await seedHostelSupervisorProfile({ hostels: [h3] })
  return { today, day, alpha, beta, gamma, zeta, eta, delta, nomad, h1, h2, s1, s2, s3 }
}

describe("dining missed-meals digest", () => {
  it("finds students with no meal all day and counts their expected days without one", async () => {
    const s = await scenario()
    const rows = await findStudentsWhoMissedMeals(s.day)
    const byRoll = Object.fromEntries(rows.map((row) => [row.student.rollNumber, row]))
    const roll = (student) => student.profile.rollNumber

    expect(byRoll[roll(s.alpha)]).toMatchObject({ daysMissed: 3, capped: false, hostel: { id: String(s.h1._id) } })
    expect(byRoll[roll(s.alpha)].lastMealAt).toBeTruthy()
    expect(byRoll[roll(s.beta)]).toMatchObject({ daysMissed: 1, capped: false })
    expect(byRoll[roll(s.delta)]).toMatchObject({ daysMissed: 5, capped: false, lastMealAt: null, hostel: { id: String(s.h2._id) } })
    expect(byRoll[roll(s.nomad)]).toMatchObject({ hostel: null })
    for (const student of [s.gamma, s.zeta, s.eta]) expect(byRoll[roll(student)]).toBeUndefined()
    expect(byRoll[roll(s.alpha)].student).toMatchObject({ name: "Alpha Student", email: s.alpha.user.email })
  })

  it("emails each supervisor once with the students of the hostels they handle", async () => {
    const s = await scenario()
    const send = vi.spyOn(emailService, "sendEmail").mockResolvedValue({ success: true })
    try {
      const result = await sendMissedMealsDigest({ date: s.day })
      const to = (sup) => send.mock.calls.map(([args]) => args).filter((args) => args.to === sup.user.email.toLowerCase())

      const [one] = to(s.s1)
      expect(to(s.s1)).toHaveLength(1)
      expect(one.html).toContain(s.alpha.profile.rollNumber)
      expect(one.html).toContain(s.beta.profile.rollNumber)
      expect(one.html).not.toContain(s.delta.profile.rollNumber)
      expect(one.html).not.toContain(s.nomad.profile.rollNumber)
      expect(one.attachments[0].filename).toBe(`missed-meals-${s.day}.csv`)
      const csv = one.attachments[0].content.split("\n")
      expect(csv[0]).toBe("Hostel,Roll number,Name,Email,Days missed,Last meal,Caterer")
      expect(csv.find((line) => line.includes(s.alpha.profile.rollNumber))).toContain(`${s.alpha.user.email},3,`)

      const [two] = to(s.s2)
      expect(to(s.s2)).toHaveLength(1)
      for (const student of [s.alpha, s.beta, s.delta]) expect(two.html).toContain(student.profile.rollNumber)

      expect(to(s.s3)).toHaveLength(0)
      expect(send.mock.calls.some(([args]) => args.html.includes(s.nomad.profile.rollNumber))).toBe(false)
      expect(result.date).toBe(s.day)
      expect(result.failed).toBe(0)
    } finally {
      send.mockRestore()
    }
  })

  it("dry run sends nothing", async () => {
    const s = await scenario()
    const send = vi.spyOn(emailService, "sendEmail").mockResolvedValue({ success: true })
    try {
      const result = await sendMissedMealsDigest({ date: s.day, dryRun: true })
      expect(send).not.toHaveBeenCalled()
      expect(result.emails.find((email) => email.to === s.s2.user.email.toLowerCase())).toMatchObject({ students: 3 })
    } finally {
      send.mockRestore()
    }
  })

  it("runs from 01:00 local, once per day", async () => {
    const year = 2040 + Math.floor(Math.random() * 50)
    expect(await runDueMissedMealsDigest({ now: new Date(year, 0, 5, 0, 30) })).toBeNull()
    const first = await runDueMissedMealsDigest({ now: new Date(year, 0, 5, 1, 0) })
    expect(first).toMatchObject({ date: `${year}-01-04`, students: 0 })
    expect(await runDueMissedMealsDigest({ now: new Date(year, 0, 5, 9, 0) })).toBe(LOCK_NOT_ACQUIRED)
  })
})
