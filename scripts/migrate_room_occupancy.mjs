/**
 * Migration: room occupancy reconcile + bed-uniqueness hardening.
 *
 * Companion to the room-owner refactor (src/services/hostel/roomOwner.service.js),
 * which made the owner the single, transactional writer of Room.occupancy. This
 * script heals any historical drift the old fire-and-forget hooks left behind and
 * (optionally) installs the unique { roomId, bedNumber } backstop index.
 *
 * Steps (each independently opt-in):
 *   - RECONCILE (--apply): set Room.occupancy = count(RoomAllocation) for every
 *     room. Fixes negative / over / stale occupancy. Idempotent.
 *   - DEDUPE (--apply --dedupe): for any (roomId, bedNumber) held by more than one
 *     allocation, keep the earliest-created one and delete the rest (clearing the
 *     affected students' currentRoomAllocation). Required before the unique index
 *     can be built. Destructive — review the dry-run report first.
 *   - BUILD INDEX (--apply --build-index): drop the non-unique { roomId, bedNumber }
 *     index and create it UNIQUE. Refuses if duplicates still exist.
 *
 *   node scripts/migrate_room_occupancy.mjs                          # dry run (report only)
 *   node scripts/migrate_room_occupancy.mjs --apply                  # reconcile occupancy
 *   node scripts/migrate_room_occupancy.mjs --apply --dedupe         # + resolve duplicate beds
 *   node scripts/migrate_room_occupancy.mjs --apply --build-index    # + build unique index
 *
 * NOTE: after the unique index exists in production, flip the schema index in
 * src/models/hostel/RoomAllocation.model.js to `{ unique: true }` so autoIndex
 * stays consistent with the collection.
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { Room, RoomAllocation, StudentProfile } from "../src/models/index.js"

const APPLY = process.argv.includes("--apply")
const DEDUPE = process.argv.includes("--dedupe")
const BUILD_INDEX = process.argv.includes("--build-index")
const SAMPLE_LIMIT = 25

const run = async () => {
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`)
  console.log(`Options: ${[DEDUPE && "dedupe", BUILD_INDEX && "build-index"].filter(Boolean).join(", ") || "reconcile only"}\n`)

  try {
    // ---- 1. Duplicate beds -------------------------------------------------
    const dupeGroups = await RoomAllocation.aggregate([
      { $group: { _id: { roomId: "$roomId", bedNumber: "$bedNumber" }, ids: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    console.log(`Duplicate (roomId, bedNumber) groups: ${dupeGroups.length}`)
    dupeGroups.slice(0, SAMPLE_LIMIT).forEach((g) => {
      console.log(`  room ${g._id.roomId} bed ${g._id.bedNumber}: ${g.count} allocations`)
    })

    if (DEDUPE && APPLY && dupeGroups.length > 0) {
      let removed = 0
      for (const group of dupeGroups) {
        // Keep the earliest-created allocation; delete the rest.
        const allocations = await RoomAllocation.find({ _id: { $in: group.ids } })
          .select("_id createdAt studentProfileId")
          .sort({ createdAt: 1 })
          .lean()
        const losers = allocations.slice(1)
        const loserIds = losers.map((a) => a._id)
        if (loserIds.length === 0) continue
        await StudentProfile.updateMany(
          { currentRoomAllocation: { $in: loserIds } },
          { $unset: { currentRoomAllocation: "" } }
        )
        await RoomAllocation.collection.deleteMany({ _id: { $in: loserIds } })
        removed += loserIds.length
      }
      console.log(`Deduped: removed ${removed} duplicate allocation(s).`)
    }

    // ---- 2. Reconcile occupancy = count(allocations) -----------------------
    const rooms = await Room.find({}).select("_id occupancy").lean()
    const counts = await RoomAllocation.aggregate([
      { $group: { _id: "$roomId", count: { $sum: 1 } } },
    ])
    const countByRoom = new Map(counts.map((c) => [String(c._id), c.count]))

    const drift = []
    const negatives = []
    const ops = []
    for (const room of rooms) {
      const actual = countByRoom.get(String(room._id)) || 0
      if (room.occupancy < 0) negatives.push({ roomId: room._id, occupancy: room.occupancy })
      if (actual !== room.occupancy) {
        drift.push({ roomId: room._id, from: room.occupancy, to: actual })
        ops.push({ updateOne: { filter: { _id: room._id }, update: { $set: { occupancy: actual } } } })
      }
    }

    console.log(`\nRooms scanned: ${rooms.length}`)
    console.log(`Negative occupancy rooms: ${negatives.length}`)
    console.log(`Rooms with occupancy drift: ${drift.length}`)
    drift.slice(0, SAMPLE_LIMIT).forEach((d) => console.log(`  room ${d.roomId}: ${d.from} -> ${d.to}`))

    if (APPLY && ops.length > 0) {
      await Room.bulkWrite(ops, { ordered: false })
      console.log(`Reconciled occupancy on ${ops.length} room(s).`)
    }

    // ---- 3. Unique index ---------------------------------------------------
    if (BUILD_INDEX && APPLY) {
      const remainingDupes = await RoomAllocation.aggregate([
        { $group: { _id: { roomId: "$roomId", bedNumber: "$bedNumber" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: "n" },
      ])
      const dupeCount = remainingDupes[0]?.n || 0
      if (dupeCount > 0) {
        console.log(`\nRefusing to build unique index: ${dupeCount} duplicate bed group(s) remain. Run with --dedupe or resolve manually.`)
      } else {
        const col = RoomAllocation.collection
        const existing = await col.indexes()
        const nonUnique = existing.find(
          (i) => i.key && i.key.roomId === 1 && i.key.bedNumber === 1 && !i.unique
        )
        if (nonUnique) {
          await col.dropIndex(nonUnique.name)
          console.log(`\nDropped non-unique index ${nonUnique.name}.`)
        }
        await col.createIndex({ roomId: 1, bedNumber: 1 }, { unique: true })
        console.log("Created unique index on { roomId, bedNumber }.")
      }
    }

    console.log(APPLY ? "\nDone." : "\nDry run only. Re-run with --apply (optionally --dedupe / --build-index) to write.")
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Room occupancy migration failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
