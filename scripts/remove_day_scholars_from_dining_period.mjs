/**
 * One-off cleanup: remove day scholars from a dining period's allocations.
 *
 * Dining is for hostellers only. Removes every allocation in the period whose
 * student profile has isDayScholar: true, whether the student chose the caterer
 * or was auto-allocated, through allocationOwner.removeStudent (each removal
 * releases its seat in the same transaction). Then switches the period's
 * eligibility to "all-hostellers" so day scholars can't be allocated again.
 *
 * Rebates, meal scans and tag answers are not touched; the report lists any the
 * removed students have so they can be reviewed by hand.
 *
 *   node scripts/remove_day_scholars_from_dining_period.mjs --period <id>            # dry run
 *   node scripts/remove_day_scholars_from_dining_period.mjs --period <id> --apply    # write
 *   npm run dining:remove-day-scholars -- --period <id> [--apply]
 *
 * Writes a CSV of the removed students next to the script's working directory
 * (day-scholars-removed-<periodId>-<timestamp>.csv) when applying.
 */

import fs from "node:fs"
import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import DiningPeriod from "../src/models/dining/DiningPeriod.model.js"
import DiningAllocation from "../src/models/dining/DiningAllocation.model.js"
import DiningRebate from "../src/models/dining/DiningRebate.model.js"
import DiningMealVerification from "../src/models/dining/DiningMealVerification.model.js"
import Caterer from "../src/models/dining/Caterer.model.js"
import { StudentProfile, User } from "../src/models/index.js"
import { allocationOwner } from "../src/services/dining/allocationOwner.service.js"
import { ELIGIBILITY_MODE_ALL_HOSTELLERS } from "../src/services/dining/diningEligibility.js"

const APPLY = process.argv.includes("--apply") && !process.argv.includes("--dry-run")
const periodArg = process.argv[process.argv.indexOf("--period") + 1]

const dayKey = (date) => new Date(date).toISOString().slice(0, 10)
const csvCell = (value) => {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const run = async () => {
  if (!process.argv.includes("--period") || !mongoose.isValidObjectId(periodArg)) {
    console.error("Usage: --period <diningPeriodId> [--apply]")
    process.exitCode = 1
    return
  }
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN"}\n`)
  try {
    const period = await DiningPeriod.findById(periodArg).select("_id startDate endDate eligibilityMode catererCapacities isArchived").lean()
    if (!period) throw new Error(`Dining period ${periodArg} not found`)
    console.log(`Period ${period._id}: ${dayKey(period.startDate)} – ${dayKey(period.endDate)}, eligibility "${period.eligibilityMode}"${period.isArchived ? " (archived)" : ""}`)

    const allocations = await DiningAllocation.find({ periodId: period._id }).lean()
    const dayScholarProfiles = await StudentProfile.find({
      _id: { $in: allocations.map((row) => row.studentProfileId) },
      isDayScholar: true,
    }).select("_id").lean()
    const dayScholarIds = new Set(dayScholarProfiles.map((profile) => String(profile._id)))
    const targets = allocations.filter((row) => dayScholarIds.has(String(row.studentProfileId)))

    const [users, caterers] = await Promise.all([
      User.find({ _id: { $in: targets.map((row) => row.studentUserId) } }).select("name email").lean(),
      Caterer.find({ _id: { $in: period.catererCapacities.map((entry) => entry.catererId) } }).select("name").lean(),
    ])
    const userById = new Map(users.map((user) => [String(user._id), user]))
    const catererName = new Map(caterers.map((caterer) => [String(caterer._id), caterer.name]))

    const fromKey = dayKey(period.startDate)
    const toKey = dayKey(period.endDate)
    const studentIds = targets.map((row) => row.studentUserId)
    const [rebates, scans] = await Promise.all([
      DiningRebate.countDocuments({ studentUserId: { $in: studentIds }, dateKeys: { $elemMatch: { $gte: fromKey, $lte: toKey } } }),
      DiningMealVerification.countDocuments({ periodId: period._id, studentUserId: { $in: studentIds } }),
    ])

    console.log(`Allocations: ${allocations.length} · day scholars: ${targets.length} (auto-allocated ${targets.filter((row) => row.unregistered).length}, self/admin ${targets.filter((row) => !row.unregistered).length})`)
    const perCaterer = {}
    for (const row of targets) perCaterer[catererName.get(String(row.catererId)) || String(row.catererId)] = (perCaterer[catererName.get(String(row.catererId)) || String(row.catererId)] || 0) + 1
    console.log("By caterer:", perCaterer)
    console.log(`Their rebates touching the period: ${rebates} · their meal scans in the period: ${scans}`)
    for (const row of targets.slice(0, 15)) {
      const user = userById.get(String(row.studentUserId))
      console.log(`  ${row.rollNumber}  ${user?.name || "?"}  → ${catererName.get(String(row.catererId)) || row.catererId}${row.unregistered ? "  [auto]" : ""}`)
    }
    if (targets.length > 15) console.log(`  … and ${targets.length - 15} more`)

    if (!APPLY) {
      console.log(`\nDry run only. Re-run with --apply to remove ${targets.length} allocation(s) and set eligibility to "${ELIGIBILITY_MODE_ALL_HOSTELLERS}".`)
      return
    }

    const removed = []
    const failed = []
    for (const row of targets) {
      const outcome = await allocationOwner.removeStudent({ periodId: period._id, studentUserId: row.studentUserId })
      if (outcome.ok) removed.push(row)
      else failed.push({ row, reason: outcome.reason })
    }
    if (period.eligibilityMode !== ELIGIBILITY_MODE_ALL_HOSTELLERS) {
      await DiningPeriod.updateOne({ _id: period._id }, { $set: { eligibilityMode: ELIGIBILITY_MODE_ALL_HOSTELLERS } })
    }

    const file = `day-scholars-removed-${period._id}-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`
    const lines = ["Roll number,Name,Email,Caterer,Auto-allocated"]
    for (const row of removed) {
      const user = userById.get(String(row.studentUserId))
      lines.push([row.rollNumber, user?.name, user?.email, catererName.get(String(row.catererId)), row.unregistered ? "yes" : "no"].map(csvCell).join(","))
    }
    fs.writeFileSync(file, `${lines.join("\n")}\n`)

    const after = await DiningPeriod.findById(period._id).select("eligibilityMode catererCapacities").lean()
    console.log(`\nRemoved ${removed.length}, failed ${failed.length}${failed.length ? `: ${failed.map((f) => `${f.row.rollNumber} (${f.reason})`).join(", ")}` : ""}`)
    console.log(`Eligibility now "${after.eligibilityMode}". Seats:`, after.catererCapacities.map((entry) => `${catererName.get(String(entry.catererId))} ${entry.allocatedCount}/${entry.maxStudentCount}`).join(" · "))
    console.log(`List written to ${file}`)
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
