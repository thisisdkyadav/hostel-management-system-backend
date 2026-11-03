#!/usr/bin/env node
/**
 * One-off: apply the ERRORLOG uploads machines sent before HMS read them
 * (they were only kept in the request log). Each error marks the photo it is
 * about as refused on that machine, exactly as the receiver now does live.
 * Safe to run twice: an error only applies while its command is still the
 * person's last photo answer.
 *
 *   node scripts/iclock-apply-saved-errorlogs.mjs           # dry run: list errors
 *   node scripts/iclock-apply-saved-errorlogs.mjs --apply
 */
import mongoose from "mongoose"
import connectDatabase from "../src/config/database.config.js"
import { iclockQueries } from "../src/services/iclock/iclockQueries.service.js"
import { parseErrorLog } from "../src/services/iclock/protocol.js"
import { applyMachineErrors } from "../src/services/iclock/roster.service.js"

const APPLY = process.argv.includes("--apply")

await connectDatabase()
const uploads = await iclockQueries.listErrorLogUploads()
let errors = 0
let changed = 0
for (const upload of uploads) {
  const parsed = parseErrorLog(upload.body)
  errors += parsed.length
  for (const error of parsed) console.log(upload.at.toISOString(), upload.sn, error.code, `cmd ${error.commandId}`, error.pin || "-")
  if (APPLY) changed += await applyMachineErrors(upload.sn, parsed)
}
console.log(`${uploads.length} upload(s), ${errors} error(s)${APPLY ? `, ${changed} person/machine row(s) marked refused` : " (dry run; --apply to apply)"}`)
await mongoose.disconnect()
