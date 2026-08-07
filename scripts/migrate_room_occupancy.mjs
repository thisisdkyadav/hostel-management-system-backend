/**
 * Migration: room occupancy reconcile + bed-uniqueness hardening.
 *
 * Companion to the room-owner refactor (src/services/hostel/roomOwner.service.js),
 * which made the owner the single, transactional writer of Room.occupancy. This
 * script heals any historical drift the old fire-and-forget hooks left behind and
 * (optionally) installs the unique { roomId, bedNumber } backstop index.
 *
 * Steps (each independently opt-in):
 *   - NORMALIZE BEDS (--apply --normalize-beds): convert any bedNumber stored as a
 *     non-numeric type (a string "1" left behind by a native-driver insert that
 *     bypassed Mongoose casting) to the integer the schema declares. A string bed
 *     defeats the Number-cast conflict reads AND the unique index (string "1" !=
 *     number 1), which is how a bed gets double-booked / throws E11000. When an
 *     integer sibling already holds that bed, the string doc is a genuine
 *     duplicate and is removed. Run this FIRST. Destructive — review the dry run.
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
 *   node scripts/migrate_room_occupancy.mjs --apply --normalize-beds # + fix string bedNumbers
 *   node scripts/migrate_room_occupancy.mjs --apply --dedupe         # + resolve duplicate beds
 *   node scripts/migrate_room_occupancy.mjs --apply --build-index    # + build unique index
 *
 * Recommended full heal on a live DB (order matters):
 *   node scripts/migrate_room_occupancy.mjs --apply --normalize-beds --dedupe --build-index
 *
 * NOTE: after the unique index exists in production, flip the schema index in
 * src/models/hostel/RoomAllocation.model.js to `{ unique: true }` so autoIndex
 * stays consistent with the collection.
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { Room, RoomAllocation, StudentProfile } from "../src/models/index.js"

const APPLY = process.argv.includes("--apply")
const NORMALIZE = process.argv.includes("--normalize-beds")
const DEDUPE = process.argv.includes("--dedupe")
const BUILD_INDEX = process.argv.includes("--build-index")
const SAMPLE_LIMIT = 25

const run = async () => {
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}`)
  console.log(`Options: ${[NORMALIZE && "normalize-beds", DEDUPE && "dedupe", BUILD_INDEX && "build-index"].filter(Boolean).join(", ") || "reconcile only"}\n`)

  try {
    // ---- 0. Normalise bedNumber type (non-numeric -> integer) --------------
    // Native-driver inserts bypass Mongoose casting, so a request body's string
    // "1" can land as a string bedNumber. String "1" != number 1 in both the
    // Number-cast conflict reads and the unique index, which is how a bed gets
    // double-booked / throws E11000. Coerce every non-numeric bed to an integer;
    // when an integer sibling already holds that bed, the string doc is a genuine
    // duplicate and is removed. Must run before dedupe / index build.
    const nonNumericBeds = await RoomAllocation.collection
      .find({ bedNumber: { $not: { $type: ["int", "long", "double", "decimal"] } } })
      .toArray()
    console.log(`Non-integer bedNumber docs: ${nonNumericBeds.length}`)
    nonNumericBeds.slice(0, SAMPLE_LIMIT).forEach((d) =>
      console.log(`  _id=${d._id} room=${d.roomId} bed=${JSON.stringify(d.bedNumber)} (${typeof d.bedNumber})`)
    )

    if (NORMALIZE && APPLY && nonNumericBeds.length > 0) {
      let converted = 0
      let removedDup = 0
      const unresolvable = []
      for (const doc of nonNumericBeds) {
        const intBed = Number(doc.bedNumber)
        if (!Number.isInteger(intBed) || intBed <= 0) {
          unresolvable.push(doc._id)
          continue
        }
        const sibling = await RoomAllocation.collection.findOne({
          _id: { $ne: doc._id },
          roomId: doc.roomId,
          bedNumber: intBed,
        })
        if (sibling) {
          // An integer bed already occupies this slot -> the string doc double-books it.
          await StudentProfile.updateMany(
            { currentRoomAllocation: doc._id },
            { $unset: { currentRoomAllocation: "" } }
          )
          await RoomAllocation.collection.deleteOne({ _id: doc._id })
          removedDup += 1
        } else {
          await RoomAllocation.collection.updateOne({ _id: doc._id }, { $set: { bedNumber: intBed } })
          converted += 1
        }
      }
      console.log(`Normalised beds: converted ${converted}, removed ${removedDup} duplicate(s), unresolvable ${unresolvable.length}.`)
      if (unresolvable.length > 0) {
        console.log(`  Unresolvable ids (manual review): ${unresolvable.slice(0, SAMPLE_LIMIT).join(", ")}`)
      }
    } else if (nonNumericBeds.length > 0 && !(NORMALIZE && APPLY)) {
      console.log("  (pass --normalize-beds --apply to convert these to integers)")
    }

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
