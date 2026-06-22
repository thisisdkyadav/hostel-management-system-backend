/**
 * Migration: student dateOfBirth / admissionDate  Date(timestamp) -> "YYYY-MM-DD".
 *
 * Converts legacy BSON Date values to date-only strings so the calendar date is
 * timezone-independent. Run `inspect_student_dates.mjs` FIRST to choose the
 * interpretation timezone from the real data distribution.
 *
 * The interpretation timezone decides which calendar day a stored instant maps
 * to. For an IST institution, Asia/Kolkata recovers the intended day for both
 * UTC-midnight and IST-midnight legacy values (IST is ahead of UTC).
 *
 * Reads/writes via the native driver (Model.collection) to bypass Mongoose
 * casting. Idempotent: values already matching ^\d{4}-\d{2}-\d{2}$ are skipped.
 *
 *   node scripts/migrate_student_dates_to_dateonly.mjs                 # dry run, tz=Asia/Kolkata
 *   node scripts/migrate_student_dates_to_dateonly.mjs --tz=UTC        # dry run, tz=UTC
 *   node scripts/migrate_student_dates_to_dateonly.mjs --apply         # apply (Asia/Kolkata)
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { StudentProfile } from "../src/models/index.js"

const FIELDS = ["dateOfBirth", "admissionDate"]
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/
const SHORT_DATE_RE = /^(\d{1,4})-(\d{2})-(\d{2})$/ // already date-only but year < 4 digits
const BATCH_SIZE = 500
const SAMPLE_LIMIT = 25

const APPLY = process.argv.includes("--apply")
const tzArg = process.argv.find((a) => a.startsWith("--tz="))
const TIMEZONE = tzArg ? tzArg.slice("--tz=".length) : "Asia/Kolkata"

const fmtParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const pad4 = (y) => String(y).padStart(4, "0")

/** Calendar Y/M/D of an instant in TIMEZONE, year zero-padded to 4 digits. */
const formatInTz = (date) => {
  const parts = fmtParts.formatToParts(date)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${pad4(get("year"))}-${get("month")}-${get("day")}`
}

/** Convert one stored value to a date-only string, or signal why it was skipped. */
const toDateOnlyString = (value) => {
  if (value == null || value === "") return { action: "skip-empty" }
  if (typeof value === "string") {
    const s = value.trim()
    if (DATE_ONLY_RE.test(s)) return { action: "already-ok" }
    // Already date-only but with a short year (junk like "1-12-02"): zero-pad it
    // so it conforms and the migration stays idempotent.
    const short = s.match(SHORT_DATE_RE)
    if (short) {
      const next = `${pad4(short[1])}-${short[2]}-${short[3]}`
      return next === s ? { action: "already-ok" } : { action: "convert", next }
    }
    const parsed = new Date(s)
    if (!Number.isNaN(parsed.getTime())) return { action: "convert", next: formatInTz(parsed) }
    return { action: "unparseable" }
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { action: "unparseable" }
    return { action: "convert", next: formatInTz(value) }
  }
  return { action: "unparseable" }
}

const run = async () => {
  await connectDatabase()
  const col = StudentProfile.collection
  console.log(`Collection: ${col.collectionName}`)
  console.log(`Interpretation timezone: ${TIMEZONE}`)
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN (no writes)"}\n`)

  const stats = {
    scanned: 0,
    convert: { dateOfBirth: 0, admissionDate: 0 },
    alreadyOk: { dateOfBirth: 0, admissionDate: 0 },
    skipEmpty: { dateOfBirth: 0, admissionDate: 0 },
    unparseable: { dateOfBirth: 0, admissionDate: 0 },
  }
  const samples = []
  const unparseableSamples = []

  try {
    const cursor = col.find(
      {},
      { projection: { dateOfBirth: 1, admissionDate: 1, rollNumber: 1 } }
    )

    let ops = []
    const flush = async () => {
      if (APPLY && ops.length) await col.bulkWrite(ops, { ordered: false })
      ops = []
    }

    for await (const doc of cursor) {
      stats.scanned += 1
      const set = {}
      const rowSample = { rollNumber: doc.rollNumber }
      let rowChanged = false

      for (const field of FIELDS) {
        const result = toDateOnlyString(doc[field])
        switch (result.action) {
          case "convert":
            stats.convert[field] += 1
            set[field] = result.next
            rowSample[field] = `${formatRaw(doc[field])} -> ${result.next}`
            rowChanged = true
            break
          case "already-ok":
            stats.alreadyOk[field] += 1
            break
          case "skip-empty":
            stats.skipEmpty[field] += 1
            break
          case "unparseable":
            stats.unparseable[field] += 1
            if (unparseableSamples.length < SAMPLE_LIMIT) {
              unparseableSamples.push(`${doc.rollNumber}: ${field}=${formatRaw(doc[field])}`)
            }
            break
        }
      }

      if (rowChanged) {
        if (samples.length < SAMPLE_LIMIT) samples.push(rowSample)
        ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: set } } })
        if (ops.length >= BATCH_SIZE) await flush()
      }
    }
    await flush()

    console.log("Sample conversions:")
    samples.forEach((s) => {
      const parts = FIELDS.filter((f) => s[f]).map((f) => `${f}: ${s[f]}`)
      console.log(`  ${String(s.rollNumber || "?").padEnd(12)} ${parts.join("  |  ")}`)
    })
    if (unparseableSamples.length) {
      console.log("\nUnparseable values (left untouched):")
      unparseableSamples.forEach((s) => console.log(`  ${s}`))
    }

    console.log("\nSummary")
    console.log(`- scanned docs: ${stats.scanned}`)
    for (const field of FIELDS) {
      console.log(
        `- ${field}: convert=${stats.convert[field]} alreadyOk=${stats.alreadyOk[field]} ` +
          `empty=${stats.skipEmpty[field]} unparseable=${stats.unparseable[field]}`
      )
    }
    console.log(
      APPLY
        ? "\nMigration applied."
        : "\nDry run only. Re-run with --apply (and the chosen --tz=) to write."
    )
  } finally {
    await mongoose.disconnect()
  }
}

const formatRaw = (v) => (v instanceof Date ? v.toISOString() : JSON.stringify(v))

run().catch((error) => {
  console.error("Student date migration failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
