/**
 * Migration: recompute proposalDueDate = scheduledStartDate - PROPOSAL_DUE_DAYS.
 *
 * The gymkhana proposal window (when proposal submission opens) changed from 21
 * to 60 days before the event. proposalDueDate is a cached field (the pre-save
 * hook only recomputes it when scheduledStartDate changes), so existing events
 * keep their old -21 value. This resets it to -60 for GymkhanaEvent and
 * MegaEventOccurrence so the new rule applies to existing events too. Idempotent.
 *
 *   node scripts/migrate_proposal_due_days.mjs            # dry run (report only)
 *   node scripts/migrate_proposal_due_days.mjs --apply    # write
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import GymkhanaEvent from "../src/models/event/GymkhanaEvent.model.js"
import MegaEventOccurrence from "../src/models/event/MegaEventOccurrence.model.js"

const PROPOSAL_DUE_DAYS = 60
const APPLY = process.argv.includes("--apply")

const recompute = async (Model, label) => {
  const docs = await Model.find({ scheduledStartDate: { $ne: null } })
    .select("_id scheduledStartDate proposalDueDate")
    .lean()

  const ops = []
  for (const doc of docs) {
    const start = new Date(doc.scheduledStartDate)
    if (Number.isNaN(start.getTime())) continue
    const due = new Date(start)
    due.setDate(due.getDate() - PROPOSAL_DUE_DAYS)
    const current = doc.proposalDueDate ? new Date(doc.proposalDueDate).getTime() : null
    if (current !== due.getTime()) {
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { proposalDueDate: due } } } })
    }
  }

  console.log(`${label}: ${docs.length} scanned, ${ops.length} to update`)
  if (APPLY && ops.length > 0) {
    await Model.bulkWrite(ops)
    console.log(`  applied ${ops.length} update(s).`)
  }
}

const run = async () => {
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN"}  (proposalDueDate = start - ${PROPOSAL_DUE_DAYS} days)\n`)
  try {
    await recompute(GymkhanaEvent, "GymkhanaEvent")
    await recompute(MegaEventOccurrence, "MegaEventOccurrence")
    console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to write.")
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Proposal due-days migration failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
