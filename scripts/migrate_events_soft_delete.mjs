/**
 * Migration: enable soft-delete on EventProposal + EventExpense.
 *
 * What it does:
 *  1. Backfills `isDeleted: false` on every existing proposal/bill that lacks
 *     the field (required so the partial-unique index covers existing bills).
 *  2. Drops the legacy plain-unique index `eventId_1` on eventexpenses so the
 *     new partial-unique index { eventId: 1 } (partialFilterExpression:
 *     { isDeleted: false }) can take effect — otherwise a bill cannot be
 *     re-submitted after one is soft-deleted.
 *  3. (Re)builds the schema-defined indexes (creates the partial-unique index).
 *
 * Dry run by default. Re-run with --apply to make changes.
 *   node scripts/migrate_events_soft_delete.mjs           # dry run
 *   node scripts/migrate_events_soft_delete.mjs --apply   # apply
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import EventProposal from "../src/models/event/EventProposal.model.js"
import EventExpense from "../src/models/event/EventExpense.model.js"

const APPLY = process.argv.includes("--apply")

const LEGACY_EXPENSE_INDEX = "eventId_1"

const countMissingFlag = async (Model) =>
  Model.countDocuments({ isDeleted: { $exists: false } })

const listIndexNames = async (collectionName) => {
  try {
    const indexes = await mongoose.connection.db.collection(collectionName).indexes()
    return indexes.map((idx) => idx.name)
  } catch {
    return []
  }
}

const run = async () => {
  await connectDatabase()

  try {
    const proposalsMissing = await countMissingFlag(EventProposal)
    const expensesMissing = await countMissingFlag(EventExpense)
    const expenseIndexes = await listIndexNames("eventexpenses")
    const hasLegacyIndex = expenseIndexes.includes(LEGACY_EXPENSE_INDEX)

    console.log("Events soft-delete migration summary")
    console.log(`- Proposals missing isDeleted: ${proposalsMissing}`)
    console.log(`- Bills missing isDeleted: ${expensesMissing}`)
    console.log(`- eventexpenses indexes: ${expenseIndexes.join(", ") || "(none)"}`)
    console.log(`- Legacy unique index '${LEGACY_EXPENSE_INDEX}' present: ${hasLegacyIndex}`)

    if (!APPLY) {
      console.log("")
      console.log("Dry run only. Re-run with --apply to backfill + fix indexes.")
      return
    }

    // 1. Backfill the flag (updateMany bypasses the soft-delete find hook).
    const proposalRes = await EventProposal.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    )
    const expenseRes = await EventExpense.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    )

    // 2. Drop the legacy plain-unique index if present.
    if (hasLegacyIndex) {
      await mongoose.connection.db.collection("eventexpenses").dropIndex(LEGACY_EXPENSE_INDEX)
      console.log(`- Dropped legacy index '${LEGACY_EXPENSE_INDEX}'`)
    }

    // 3. Build schema indexes (creates the partial-unique eventId index + isDeleted indexes).
    await EventProposal.createIndexes()
    await EventExpense.createIndexes()

    const afterExpenseIndexes = await listIndexNames("eventexpenses")

    console.log("")
    console.log("Migration applied successfully")
    console.log(`- Proposals backfilled: ${proposalRes.modifiedCount}`)
    console.log(`- Bills backfilled: ${expenseRes.modifiedCount}`)
    console.log(`- eventexpenses indexes now: ${afterExpenseIndexes.join(", ")}`)
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Events soft-delete migration failed:", error)
  mongoose.disconnect().finally(() => {
    process.exit(1)
  })
})
