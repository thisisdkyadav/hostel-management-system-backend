/**
 * Remove historical face-scan duplicates less than 40 seconds from a verified
 * entry for the same student, caterer, period and meal. Exactly 40 seconds is kept.
 * Machine timestamps are compared in either direction to handle delayed requests.
 * Manual entries and verified entries are preserved.
 *
 * node scripts/cleanup_dining_duplicates.mjs           # preview only
 * node scripts/cleanup_dining_duplicates.mjs --apply   # back up, then delete
 * Reads MONGO_URI from the environment or backend/.env. Run from backend/.
 */
import { mkdir, open } from "node:fs/promises"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import mongoose from "mongoose"
import dotenv from "dotenv"
import DiningMealVerification from "../src/models/dining/DiningMealVerification.model.js"

export const duplicateCleanupPipeline = (collectionName) => [
  { $match: {
    status: "duplicate",
    source: "face-scanner",
    scannedAt: { $type: "date" },
    catererId: { $type: "objectId" },
    periodId: { $type: "objectId" },
    rollNumber: { $type: "string", $ne: "" },
    mealSlotKey: { $type: "string", $ne: "" },
  } },
  { $lookup: {
    from: collectionName,
    let: { roll: "$rollNumber", caterer: "$catererId", period: "$periodId", meal: "$mealSlotKey", time: "$scannedAt" },
    pipeline: [
      { $match: {
        status: "verified",
        scannedAt: { $type: "date" },
        $expr: { $and: [
          { $eq: ["$rollNumber", "$$roll"] },
          { $eq: ["$catererId", "$$caterer"] },
          { $eq: ["$periodId", "$$period"] },
          { $eq: ["$mealSlotKey", "$$meal"] },
          { $gt: ["$scannedAt", { $subtract: ["$$time", 40_000] }] },
          { $lt: ["$scannedAt", { $add: ["$$time", 40_000] }] },
        ] },
      } },
      { $limit: 1 },
      { $project: { _id: 1, scannedAt: 1 } },
    ],
    as: "matchingVerified",
  } },
  { $match: { "matchingVerified.0": { $exists: true } } },
]

export async function cleanupDiningDuplicates({ mongoUri, apply = false }) {
  if (!mongoUri) throw new Error("MONGO_URI is required")
  await mongoose.connect(mongoUri, { autoIndex: false, autoCreate: false })
  let backup
  let cursor
  try {
    const collection = DiningMealVerification.collection
    console.log(`Database: ${mongoose.connection.name}; mode: ${apply ? "APPLY" : "DRY RUN"}`)
    cursor = collection.aggregate(duplicateCleanupPipeline(collection.name), { allowDiskUse: true, batchSize: 200 })
    let matched = 0
    let deleted = 0
    let batch = []
    const flush = async () => {
      if (!batch.length) return
      if (!backup) {
        const directory = resolve("logs")
        await mkdir(directory, { recursive: true })
        const backupPath = resolve(directory, `dining-duplicates-${Date.now()}.jsonl`)
        backup = await open(backupPath, "wx", 0o600)
        console.log(`Backup (MongoDB Extended JSON): ${backupPath}`)
      }
      await backup.writeFile(batch.map((entry) => mongoose.mongo.BSON.EJSON.stringify(entry)).join("\n") + "\n")
      await backup.sync()
      const result = await collection.deleteMany({ _id: { $in: batch.map((entry) => entry._id) }, status: "duplicate", source: "face-scanner" })
      deleted += result.deletedCount
      batch = []
    }
    for await (const entry of cursor) {
      matched += 1
      const verified = entry.matchingVerified[0]
      if (matched <= 20) {
        console.log(`${entry._id} roll=${entry.rollNumber} scan=${entry.scannedAt.toISOString()} verified=${verified.scannedAt.toISOString()} gap=${Math.abs(entry.scannedAt - verified.scannedAt) / 1000}s`)
      }
      if (apply) {
        const { matchingVerified, ...record } = entry
        batch.push(record)
        if (batch.length >= 200) await flush()
      }
    }
    if (apply) await flush()
    console.log(`Matched: ${matched}; deleted: ${deleted}`)
    if (!apply) console.log("Preview only. Run again with --apply to back up and delete these duplicates.")
    return { matched, deleted }
  } finally {
    await cursor?.close()
    await backup?.close()
    await mongoose.disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  dotenv.config({ quiet: true })
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== "--apply")) {
    console.error("Usage: node scripts/cleanup_dining_duplicates.mjs [--apply]")
    process.exitCode = 1
  } else {
    cleanupDiningDuplicates({ mongoUri: process.env.MONGO_URI, apply: args.includes("--apply") }).catch((error) => {
      console.error("Dining duplicate cleanup failed:", error.message)
      process.exitCode = 1
    })
  }
}
