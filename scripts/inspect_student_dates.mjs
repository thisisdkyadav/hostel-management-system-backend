/**
 * Inspection (READ-ONLY): student dateOfBirth / admissionDate storage.
 *
 * Reports, for each date-only field, how the legacy values are stored so we can
 * pick a safe conversion rule before migrating timestamps -> "YYYY-MM-DD":
 *   - count present, and breakdown by BSON type (Date vs String vs other)
 *   - for Date values: a histogram of the UTC time-of-day component
 *     (e.g. "00:00:00.000" = UTC midnight, "18:30:00.000" = IST midnight)
 *   - min / max
 *   - ~12 samples showing what the IST vs UTC interpretation would yield
 *
 * Never writes. Reads via the native driver (Model.collection) so stored BSON
 * Dates come through as real Dates (no Mongoose String casting).
 *
 *   node scripts/inspect_student_dates.mjs
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import { StudentProfile } from "../src/models/index.js"

const FIELDS = ["dateOfBirth", "admissionDate"]
const SAMPLE_LIMIT = 12

const istDate = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)

const utcDate = (d) => d.toISOString().slice(0, 10)
const utcTimeOfDay = (d) => d.toISOString().slice(11, 23) // HH:MM:SS.mmm

const typeOf = (v) => {
  if (v == null) return "null"
  if (v instanceof Date) return "Date"
  if (typeof v === "string") return "String"
  return typeof v
}

const run = async () => {
  await connectDatabase()
  const col = StudentProfile.collection
  console.log(`Collection: ${col.collectionName}`)

  try {
    const totalDocs = await col.countDocuments({})
    console.log(`Total student profiles: ${totalDocs}\n`)

    for (const field of FIELDS) {
      const cursor = col.find(
        { [field]: { $exists: true, $ne: null } },
        { projection: { [field]: 1, rollNumber: 1 } }
      )

      const typeCounts = {}
      const utcTimeHistogram = {}
      const samples = []
      let present = 0
      let minIso = null
      let maxIso = null

      for await (const doc of cursor) {
        const value = doc[field]
        if (value === "" || value == null) continue
        present += 1
        const t = typeOf(value)
        typeCounts[t] = (typeCounts[t] || 0) + 1

        if (value instanceof Date) {
          const tod = utcTimeOfDay(value)
          utcTimeHistogram[tod] = (utcTimeHistogram[tod] || 0) + 1
          const iso = value.toISOString()
          if (minIso === null || iso < minIso) minIso = iso
          if (maxIso === null || iso > maxIso) maxIso = iso
          if (samples.length < SAMPLE_LIMIT) {
            samples.push({
              rollNumber: doc.rollNumber,
              raw: iso,
              ist: istDate(value),
              utc: utcDate(value),
              diverges: istDate(value) !== utcDate(value),
            })
          }
        } else if (samples.length < SAMPLE_LIMIT) {
          samples.push({ rollNumber: doc.rollNumber, raw: value })
        }
      }

      console.log(`==== ${field} ====`)
      console.log(`present: ${present}`)
      console.log(`by type: ${JSON.stringify(typeCounts)}`)
      if (Object.keys(utcTimeHistogram).length) {
        console.log("UTC time-of-day histogram (Date values):")
        Object.entries(utcTimeHistogram)
          .sort((a, b) => b[1] - a[1])
          .forEach(([tod, n]) => console.log(`  ${tod}  ->  ${n}`))
        console.log(`min: ${minIso}`)
        console.log(`max: ${maxIso}`)
      }
      console.log("samples (IST vs UTC interpretation):")
      samples.forEach((s) =>
        console.log(
          `  ${String(s.rollNumber || "?").padEnd(12)} raw=${s.raw}` +
            (s.ist ? `  IST=${s.ist}  UTC=${s.utc}${s.diverges ? "  <-- DIVERGES" : ""}` : "")
        )
      )
      console.log("")
    }

    console.log("Read-only inspection complete. No documents were modified.")
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Student date inspection failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
