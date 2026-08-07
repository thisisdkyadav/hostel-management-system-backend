/**
 * Reconcile: HostelInventory.availableCount heal.
 *
 * Companion to the inventory-owner refactor
 * (src/services/inventory/inventoryOwner.service.js), which made the owner the
 * single writer of availableCount via atomic guarded $inc. This script heals any
 * historical drift the old read-modify-write left behind (concurrent issues that
 * oversold / drove availableCount negative).
 *
 * Ground truth: a unit is "out" while its StudentInventory row is not Returned
 * (Issued / Damaged / Lost all keep it out; Returned puts it back). So:
 *
 *     correct availableCount = allocatedCount - sum(count of non-Returned rows)
 *
 * This matches every owner code path (issue -count, return +count, status
 * Damaged/Lost leaves it out, allocation edits move allocated and available by
 * the same delta).
 *
 * Anomalies (correct < 0 => more units issued than allocated) are NOT auto-fixed:
 * that means the collection is internally over-issued and needs a human decision
 * (raise the allocation, or recall items). They are reported and skipped so the
 * script never writes a negative availableCount.
 *
 *   node scripts/reconcile_inventory_available.mjs           # dry run (report only)
 *   node scripts/reconcile_inventory_available.mjs --apply   # heal drift (skips anomalies)
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { HostelInventory, StudentInventory } from "../src/models/index.js"

const APPLY = process.argv.includes("--apply")
const SAMPLE_LIMIT = 25

const run = async () => {
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`)

  try {
    // Units currently out per hostel allocation = sum of non-Returned rows.
    const outAgg = await StudentInventory.aggregate([
      { $match: { status: { $ne: "Returned" } } },
      { $group: { _id: "$hostelInventoryId", out: { $sum: "$count" } } },
    ])
    const outByHostelInventory = new Map(outAgg.map((o) => [String(o._id), o.out]))

    const allocations = await HostelInventory.find({})
      .select("_id hostelId itemTypeId allocatedCount availableCount")
      .lean()

    const drift = []
    const anomalies = [] // correct < 0 (over-issued): units out exceed allocated
    const currentNegatives = []
    const ops = []

    for (const hi of allocations) {
      const out = outByHostelInventory.get(String(hi._id)) || 0
      const correct = hi.allocatedCount - out

      if (hi.availableCount < 0) {
        currentNegatives.push({ id: hi._id, availableCount: hi.availableCount })
      }

      if (correct < 0) {
        anomalies.push({
          id: hi._id,
          hostelId: hi.hostelId,
          itemTypeId: hi.itemTypeId,
          allocatedCount: hi.allocatedCount,
          out,
          availableCount: hi.availableCount,
        })
        continue // never write a negative; leave for manual review
      }

      if (correct !== hi.availableCount) {
        drift.push({ id: hi._id, from: hi.availableCount, to: correct })
        ops.push({ updateOne: { filter: { _id: hi._id }, update: { $set: { availableCount: correct, updatedAt: new Date() } } } })
      }
    }

    console.log(`Hostel allocations scanned: ${allocations.length}`)
    console.log(`Currently negative availableCount: ${currentNegatives.length}`)
    console.log(`Allocations with availableCount drift (healable): ${drift.length}`)
    drift.slice(0, SAMPLE_LIMIT).forEach((d) => console.log(`  ${d.id}: ${d.from} -> ${d.to}`))

    console.log(`\nOver-issued anomalies (units out > allocated, NOT auto-fixed): ${anomalies.length}`)
    anomalies.slice(0, SAMPLE_LIMIT).forEach((a) =>
      console.log(`  ${a.id} hostel=${a.hostelId} item=${a.itemTypeId}: allocated=${a.allocatedCount} out=${a.out} available=${a.availableCount}`)
    )
    if (anomalies.length > 0) {
      console.log("  -> resolve manually: raise allocatedCount or recall/return items, then re-run.")
    }

    if (APPLY && ops.length > 0) {
      await HostelInventory.bulkWrite(ops, { ordered: false })
      console.log(`\nReconciled availableCount on ${ops.length} allocation(s).`)
    }

    console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply to write.")
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Inventory availableCount reconcile failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
