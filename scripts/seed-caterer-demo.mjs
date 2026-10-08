#!/usr/bin/env node
/**
 * Reversible LOCAL DEV fixture; never clears a collection or changes existing docs.
 * From the repo root (also works from any directory):
 *   node backend/scripts/seed-caterer-demo.mjs --seed
 *   node backend/scripts/seed-caterer-demo.mjs --cleanup
 * All created _ids are committed atomically with devseed_caterer_demo's manifest.
 * Re-seeding replaces only that manifest's documents; failures roll back the swap.
 * Model access here is dev tooling outside src/, which check:boundary scans.
 */
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import mongoose from "mongoose"
import bcrypt from "bcrypt"
import { User, StudentProfile, Caterer, DiningPeriod, DiningAllocation, DiningMealVerification, DiningRebate } from "../src/models/index.js"

const KEY = "caterer-demo-v1"
const EMAIL = "caterer.demo@hms.local"
const PASSWORD = "CatererDemo@123"
const NAME = "Annapurna Caterers (demo)"
const DAY_MS = 86_400_000
const utcDay = (key) => new Date(`${key}T00:00:00.000Z`)
const dayKey = (date) => date.toISOString().slice(0, 10)
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS)
const oid = () => new mongoose.Types.ObjectId()
const MODELS = [User, Caterer, DiningPeriod, DiningAllocation, DiningRebate, DiningMealVerification]
const ALLOWED_COLLECTIONS = new Set(MODELS.map((model) => model.collection.name))
const slots = [
  { name: "Breakfast", startTime: "07:30", endTime: "09:30" },
  { name: "Lunch", startTime: "12:00", endTime: "14:30" },
  { name: "Dinner", startTime: "19:30", endTime: "21:30" },
]
const messages = {
  verified: "Meal verified successfully",
  duplicate: "Student has already been verified for this meal",
  "wrong-caterer": "Student is allocated to another caterer",
  "unknown-student": "Student roll number not found",
  "outside-meal-time": "Scan is outside configured meal timings",
  "on-rebate": "Student is on approved rebate for this day",
}

// Repeatable attendance patterns; IDs and bcrypt salts intentionally remain fresh.
let randomState = 20261008
const random = () => {
  randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0
  return randomState / 4294967296
}
const normal = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) * Math.cos(2 * Math.PI * random())
const shuffled = (rows) => {
  const result = [...rows]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
const localTime = (key, time) => new Date(`${key}T${time}:00`)
const identities = (profile) => ({
  studentUserId: profile.userId._id,
  studentProfileId: profile._id,
  rollNumber: profile.rollNumber,
})

async function cleanup(session, markers) {
  const marker = await markers.findOne({ _id: KEY }, { session })
  if (!marker) return {}
  if (marker.version !== 1 || marker.modifiedExisting !== false) throw new Error("Unrecognized manifest; refusing cleanup")
  const removed = {}
  for (const [collection, ids] of Object.entries(marker.created).reverse()) {
    if (!ALLOWED_COLLECTIONS.has(collection) || !Array.isArray(ids) || ids.some((id) => !(id instanceof mongoose.Types.ObjectId))) {
      throw new Error(`Invalid manifest entry: ${collection}`)
    }
    removed[collection] = (await mongoose.connection.db.collection(collection).deleteMany({ _id: { $in: ids } }, { session })).deletedCount
  }
  await markers.deleteOne({ _id: KEY }, { session })
  return removed
}

async function seed(session, markers, now) {
  randomState = 20261008
  const startDate = utcDay("2026-09-15")
  const endDate = utcDay("2026-10-31")
  const today = utcDay(dayKey(now))
  if (today < startDate || today > endDate) throw new Error("This dated demo requires a server date between 2026-09-15 and 2026-10-31")
  if (await User.exists({ email: EMAIL }).session(session) || await Caterer.exists({ $or: [{ emailLower: EMAIL }, { nameLower: NAME.toLowerCase() }] }).session(session)) {
    throw new Error("Demo email/name already exists without our manifest; refusing to change it")
  }

  // Exclude allocations in ALL overlapping periods, including archived ones.
  const overlapping = await DiningPeriod.find({ startDate: { $lte: endDate }, endDate: { $gte: utcDay("2026-08-01") } }).select("_id").session(session).lean()
  const busy = await DiningAllocation.distinct("studentUserId", { periodId: { $in: overlapping.map((p) => p._id) } }).session(session)
  const candidates = await StudentProfile.find({ status: "Active", userId: { $nin: busy } })
    .populate({ path: "userId", select: "name email profileImage role", options: { session } }).session(session).lean()
  const score = (p) => Number(Boolean(p.currentRoomAllocation)) * 2 + Number(Boolean(p.userId.profileImage))
  const roster = candidates.filter((p) => p.userId?.role === "Student" && p.userId.name?.trim() && p.userId.email?.trim())
    .sort((a, b) => score(b) - score(a) || a.rollNumber.localeCompare(b.rollNumber)).slice(0, 80)
  if (roster.length !== 80) throw new Error(`Need 80 eligible students; found ${roster.length}`)
  const activeCount = await StudentProfile.countDocuments({ status: "Active" }).session(session)
  const otherCaterer = await Caterer.findOne({ isArchived: false }).session(session).lean()
  const admin = await User.findOne({ role: { $in: ["Admin", "Super Admin"] } }).select("_id").session(session).lean()
  if (!otherCaterer || !admin) throw new Error("Need an existing caterer and admin for realistic issue/rejection references")

  const userId = oid(), catererId = oid(), periodId = oid(), archivedPeriodId = oid()
  const created = Object.fromEntries(MODELS.map((model) => [model.collection.name, []]))
  const insert = async (model, rows) => {
    for (const row of rows) row._id ??= oid()
    // Track only explicit top-level documents, never the existing referenced IDs.
    created[model.collection.name].push(...rows.map((row) => row._id))
    return model.insertMany(rows, { session })
  }
  await insert(User, [{ _id: userId, name: NAME, email: EMAIL, role: "Dining", subRole: "Caterer", password: await bcrypt.hash(PASSWORD, 10) }])
  await insert(Caterer, [{ _id: catererId, name: NAME, email: EMAIL, userId }])
  const basePeriod = {
    registrationEnabled: false, allocationStartAt: null, allocationEndAt: null,
    catererIds: [catererId], dailyRate: 120, mealSlots: slots,
    eligibilityMode: "all-active", eligibleStudentCount: activeCount,
    // Defaults from the rebate service; six-day continuous limit allows the brief's 2–6 day short-term fixtures.
    rebateSettings: { shortTermMaxTotalDays: 10, shortTermMaxContinuousDays: 6, shortTermMinApplicationDays: 1, shortTermMinAdvanceDays: 2 },
  }
  const archivedRoster = roster.slice(0, 30)
  await insert(DiningPeriod, [
    { ...basePeriod, _id: periodId, startDate, endDate, isArchived: false,
      catererCapacities: [{ catererId, maxStudentCount: 100, allocatedCount: roster.length }] },
    { ...basePeriod, _id: archivedPeriodId, startDate: utcDay("2026-08-01"), endDate: utcDay("2026-08-31"), isArchived: true,
      catererCapacities: [{ catererId, maxStudentCount: 50, allocatedCount: archivedRoster.length }] },
  ])
  await insert(DiningAllocation, [
    ...roster.map((p) => ({ ...identities(p), periodId, catererId, selectedAt: addDays(startDate, -3) })),
    ...archivedRoster.map((p) => ({ ...identities(p), periodId: archivedPeriodId, catererId, selectedAt: utcDay("2026-07-29") })),
  ])

  const rebates = []
  const reasons = ["Visiting family", "Academic conference", "Medical appointment and recovery", "Outstation internship interview", "Family function"]
  const addRebate = (index, start, length, status = "approved") => {
    const end = addDays(start, length - 1)
    if (start < startDate || end > endDate) return // Keep relative fixtures inside this fixed period on later runs.
    const requestedAt = new Date(Math.min(addDays(start, -3).getTime(), now.getTime()))
    rebates.push({
      ...identities(roster[index]), periodId, catererId,
      requestGroupId: randomUUID(), startDate: start, endDate: end,
      dateKeys: Array.from({ length }, (_, i) => dayKey(addDays(start, i))), dayCount: length,
      type: length <= 6 ? "short-term" : "long-term", status,
      reason: `${reasons[index % reasons.length]} (demo)`,
      approvedAt: status === "approved" ? requestedAt : null, approvedBy: null,
      rejectedBy: status === "rejected" ? admin._id : null,
      rejectedAt: status === "rejected" ? addDays(requestedAt, 1) : null,
      adminComment: status === "rejected" ? "Insufficient supporting details (demo)" : "",
      createdAt: requestedAt, updatedAt: status === "rejected" ? addDays(requestedAt, 1) : requestedAt,
    })
  }
  // Ten past requests; the last three end yesterday, producing three returning students.
  const pastOffsets = [-21, -18, -16, -14, -12, -10, -7, -5, -4, -3]
  pastOffsets.forEach((offset, i) => addRebate(i, addDays(today, offset), i >= 7 ? -offset : 2 + i % 5))
  // Eight distinct students away today; seven requests start within the next fourteen days.
  for (let i = 0; i < 8; i++) addRebate(10 + i, addDays(today, -(i % 3)), 3 + i % 4)
  for (let i = 0; i < 7; i++) addRebate(18 + i, addDays(today, [1, 1, 3, 5, 7, 9, 12][i]), 2 + i % 5)
  // Pending/rejected are long-term, matching the service's admin-review workflow.
  for (let i = 0; i < 4; i++) addRebate(25 + i, addDays(today, 3 + i), [10, 8, 12, 7][i], "pending")
  for (let i = 0; i < 3; i++) addRebate(29 + i, addDays(today, i), 7 + i, "rejected")
  await insert(DiningRebate, rebates)
  const onRebate = (p, key) => rebates.some((r) => r.status === "approved" && String(r.studentUserId) === String(p.userId._id) && r.dateKeys.includes(key))

  const meals = []
  for (let day = startDate; day <= today; day = addDays(day, 1)) {
    for (const slot of slots) {
      const key = dayKey(day), start = localTime(key, slot.startTime), end = localTime(key, slot.endTime)
      if (start >= now) continue
      meals.push({ slot, key, start, end, weekend: [0, 6].includes(start.getDay()) })
    }
  }
  const scans = []
  const addScan = (p, meal, status, at, extra = {}) => {
    scans.push({
      ...(p ? identities(p) : { studentUserId: null, studentProfileId: null, rollNumber: "DEMO-UNKNOWN-ROLL" }),
      periodId, catererId, expectedCatererId: p ? catererId : null,
      mealSlotKey: meal.slot.name.toLowerCase(), mealSlotName: meal.slot.name,
      status, source: random() < 0.85 ? "face-scanner" : "manual",
      message: messages[status], scannedAt: at, createdAt: at, updatedAt: at,
      scannerId: null, deviceId: "devseed-caterer-demo", ...extra,
    })
  }
  meals.forEach((meal, mi) => {
    const eligible = shuffled(roster.filter((p) => !onRebate(p, meal.key)))
    const rates = { Breakfast: [0.65, 0.80], Lunch: [0.85, 0.92], Dinner: [0.80, 0.90] }
    const [low, high] = rates[meal.slot.name]
    let rate = low + random() * (high - low)
    if (meal.weekend && meal.slot.name === "Breakfast") rate = 0.65 + random() * 0.04
    const duration = meal.end - meal.start
    const elapsed = Math.min(1, (now - meal.start) / duration)
    // At pre-breakfast times the most recent ended meal remains deliberately partial.
    if (mi === meals.length - 1) rate *= Math.min(0.55, elapsed)
    const attending = eligible.slice(0, Math.floor(eligible.length * rate))
    attending.forEach((p, i) => {
      const fraction = Math.max(0.02, Math.min(0.95, (random() < 0.3 ? 0.36 + normal() * 0.035 : 0.43 + normal() * 0.16)))
      const at = new Date(Math.min(meal.start.getTime() + fraction * duration, now.getTime() - 1000))
      addScan(p, meal, "verified", at)
      if (mi % 9 === 0 && i === 0 && at.getTime() + 95_000 < Math.min(meal.end.getTime(), now.getTime())) {
        addScan(p, meal, "duplicate", new Date(at.getTime() + 95_000))
      }
    })
    const away = roster.find((p) => onRebate(p, meal.key))
    if (away && mi % 7 === 0) addScan(away, meal, "on-rebate", new Date(Math.min(meal.start.getTime() + duration * 0.3, now.getTime() - 1000)))
    if (mi % 17 === 0) {
      // Unknown-student is resolved BEFORE period/meal lookup in the real service.
      addScan(null, meal, "unknown-student", new Date(meal.start.getTime() + 60_000), { periodId: null, mealSlotKey: "", mealSlotName: "" })
      addScan(eligible[0], meal, "outside-meal-time", new Date(meal.start.getTime() - 10 * 60_000), { expectedCatererId: null, mealSlotKey: "", mealSlotName: "" })
    }
    if (mi % 23 === 0) {
      // Our allocated student attempts the EXISTING other caterer's scanner.
      // This preserves allocation truth without changing that caterer or inventing a guest allocation.
      addScan(eligible[1], meal, "wrong-caterer", new Date(meal.start.getTime() + 120_000), { catererId: otherCaterer._id })
    }
  })
  // Guarantee no attempt (including issues) lies in the future, even just after a slot opens.
  const pastScans = scans.filter((scan) => scan.scannedAt <= now)
  await insert(DiningMealVerification, pastScans)
  const summary = {
    database: mongoose.connection.name, now: now.toISOString(), serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userId, catererId, periodId, archivedPeriodId,
    allocations: { current: roster.length, archived: archivedRoster.length },
    studentsWithRoom: roster.filter((p) => p.currentRoomAllocation).length,
    studentsWithImage: roster.filter((p) => p.userId.profileImage).length,
    mealWindows: meals.length, latestMeal: meals.at(-1) ? `${meals.at(-1).key} ${meals.at(-1).slot.name} (partial)` : null,
    scansByStatus: Object.fromEntries(Object.keys(messages).map((status) => [status, pastScans.filter((scan) => scan.status === status).length])),
    scansBySource: Object.fromEntries(["face-scanner", "manual"].map((source) => [source, pastScans.filter((scan) => scan.source === source).length])),
    rebatesByStatus: Object.fromEntries(["approved", "pending", "rejected"].map((status) => [status, rebates.filter((r) => r.status === status).length])),
    awayToday: rebates.filter((r) => r.status === "approved" && r.dateKeys.includes(dayKey(today))).length,
    backToday: rebates.filter((r) => r.status === "approved" && r.dateKeys.at(-1) === dayKey(addDays(today, -1))).length,
    startingTomorrow: rebates.filter((r) => r.status === "approved" && r.dateKeys[0] === dayKey(addDays(today, 1))).length,
    createdCounts: Object.fromEntries(Object.entries(created).map(([collection, ids]) => [collection, ids.length])),
    modifiedExisting: false,
  }
  await markers.insertOne({ _id: KEY, version: 1, label: "demo", modifiedExisting: false, createdAt: now, created, summary }, { session })
  return summary
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || !["--seed", "--cleanup"].includes(args[0])) throw new Error("Usage: node backend/scripts/seed-caterer-demo.mjs --seed|--cleanup")
  dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true })
  if (process.env.NODE_ENV === "production") throw new Error("Refusing production environment")
  const uri = process.env.MONGO_URI
  if (!uri || !/^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\/hms_local3(?:\?|$)/.test(uri)) {
    throw new Error("MONGO_URI must target local mongodb://localhost (or loopback IP) database hms_local3")
  }
  // Disable implicit schema/index writes to existing collections.
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 5000 })
  try {
    const markers = mongoose.connection.db.collection("devseed_caterer_demo")
    const session = await mongoose.startSession()
    let removed, summary
    try {
      await session.withTransaction(async () => {
        removed = await cleanup(session, markers)
        if (args[0] === "--seed") summary = await seed(session, markers, new Date())
      })
    } finally {
      await session.endSession()
    }
    console.log("Cleanup:", JSON.stringify(removed))
    if (summary) {
      console.log("Seed summary:", JSON.stringify(summary, null, 2))
      console.log(`Login: ${EMAIL} / ${PASSWORD}`)
    } else {
      console.log("Cleanup complete. Only manifest-listed documents were removed; no existing records were modified.")
    }
  } finally {
    await mongoose.disconnect()
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1 })
