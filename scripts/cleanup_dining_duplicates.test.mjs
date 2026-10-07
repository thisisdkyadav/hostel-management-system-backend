import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import mongoose from "mongoose"

const run = promisify(execFile)
const script = fileURLToPath(new URL("./cleanup_dining_duplicates.mjs", import.meta.url))

test("cleanup previews, backs up and deletes only nearby face duplicates", async () => {
  const uri = `mongodb://127.0.0.1:27017/hms_integration_tests_dining_cleanup_${process.pid}?replicaSet=rs0`
  const directory = await mkdtemp(join(tmpdir(), "hms-dining-cleanup-"))
  const connection = await mongoose.createConnection(uri).asPromise()
  try {
    const collection = connection.collection("diningmealverifications")
    const catererId = new mongoose.Types.ObjectId()
    const periodId = new mongoose.Types.ObjectId()
    const scanTime = Date.UTC(2026, 9, 7, 12)
    const record = (offset, overrides = {}) => ({
      _id: new mongoose.Types.ObjectId(), catererId, periodId,
      rollNumber: "STUDENT1", mealSlotKey: "lunch", source: "face-scanner",
      status: "duplicate", scannedAt: new Date(scanTime + offset), ...overrides,
    })
    const removable = [0, 1, 14_999, -14_999].map((offset) => record(offset))
    for (let i = 0; i < 205; i += 1) removable.push(record(2000 + i))
    removable.push(record(1000, { rollNumber: "MANUAL_VERIFIED" }))
    const preserved = [
      record(0, { status: "verified" }),
      record(15_000), record(-15_000), record(16_000),
      record(1000, { source: "manual" }),
      record(1000, { rollNumber: "OTHER_STUDENT" }),
      record(1000, { catererId: new mongoose.Types.ObjectId() }),
      record(1000, { periodId: new mongoose.Types.ObjectId() }),
      record(1000, { mealSlotKey: "dinner" }),
      record(1000, { status: "wrong-caterer" }),
      record(0, { rollNumber: "MANUAL_VERIFIED", status: "verified", source: "manual" }),
    ]
    await collection.insertMany([...removable, ...preserved])
    const execute = (args = []) => run(process.execPath, [script, ...args], {
      cwd: directory, env: { ...process.env, MONGO_URI: uri }, timeout: 30_000,
    })
    const preview = await execute()
    assert.match(preview.stdout, new RegExp(`Matched: ${removable.length}; deleted: 0`))
    assert.equal(await collection.countDocuments(), removable.length + preserved.length)
    assert.deepEqual(await readdir(directory), [])

    const applied = await execute(["--apply"])
    assert.match(applied.stdout, new RegExp(`Matched: ${removable.length}; deleted: ${removable.length}`))
    const remaining = await collection.find().toArray()
    assert.deepEqual(remaining.map((entry) => String(entry._id)).sort(), preserved.map((entry) => String(entry._id)).sort())
    const [backupName] = await readdir(join(directory, "logs"))
    const backup = (await readFile(join(directory, "logs", backupName), "utf8")).trim().split("\n")
      .map((line) => mongoose.mongo.BSON.EJSON.parse(line))
    assert.deepEqual(backup.map((entry) => String(entry._id)).sort(), removable.map((entry) => String(entry._id)).sort())
    assert.ok(backup.every((entry) => entry.scannedAt instanceof Date && entry._id instanceof mongoose.Types.ObjectId))
    assert.ok(backup.every((entry) => !("matchingVerified" in entry)))

    const repeated = await execute(["--apply"])
    assert.match(repeated.stdout, /Matched: 0; deleted: 0/)
    assert.equal((await readdir(join(directory, "logs"))).length, 1)
  } finally {
    await connection.dropDatabase()
    await connection.close()
    await rm(directory, { recursive: true, force: true })
  }
})
