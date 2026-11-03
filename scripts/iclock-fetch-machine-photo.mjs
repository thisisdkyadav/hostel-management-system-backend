#!/usr/bin/env node
/**
 * Ask ONE machine for ONE person's stored face photo and wait for it.
 * Used to find out whether (and how) the firmware answers photo queries.
 * Read-only on the machine: the command only asks it to upload what it holds.
 *
 *   node scripts/iclock-fetch-machine-photo.mjs <SN> <PIN> [--command "DATA QUERY BIOPHOTO PIN=<PIN>"] [--wait 180]
 *
 * Needs hms-iclock running (it receives the upload and saves the file).
 */
import mongoose from "mongoose"
import connectDatabase from "../src/config/database.config.js"
import { iclockQueries } from "../src/services/iclock/iclockQueries.service.js"
import { machinePhotoDir, requestMachinePhoto } from "../src/services/iclock/machine-photos.service.js"

const args = process.argv.slice(2)
const [sn, pin] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
if (!sn || !pin) {
  console.error("usage: iclock-fetch-machine-photo.mjs <SN> <PIN> [--command CMD] [--wait SECONDS]")
  process.exit(2)
}
const command = opt("command", "").replaceAll("<PIN>", pin) || undefined
const waitMs = Number(opt("wait", "180")) * 1000

await connectDatabase()
const before = (await iclockQueries.findRosterPerson(sn, pin))?.machinePhoto?.at || null
const queued = await requestMachinePhoto(sn, pin, command ? { command } : {})
console.log(`queued #${queued.commandId}: ${queued.command}`)

const started = Date.now()
let answered = null
while (Date.now() - started < waitMs) {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const cmd = await iclockQueries.findCommand(sn, queued.commandId)
  if (!answered && ["done", "failed"].includes(cmd.status)) {
    answered = cmd
    console.log(`answered: status=${cmd.status} return=${cmd.returnCode} ${cmd.result}${cmd.machineError?.code ? ` error=${cmd.machineError.code}` : ""}`)
  }
  const photo = (await iclockQueries.findRosterPerson(sn, pin))?.machinePhoto
  if (photo?.at && (!before || photo.at > before)) {
    console.log(`PHOTO RECEIVED: ${photo.kind} ${photo.size} bytes sha256=${photo.sha256}`)
    console.log(`file: ${machinePhotoDir()}/${sn}/${pin}.jpg`)
    break
  }
  if (answered && Date.now() - new Date(answered.doneAt).getTime() > 30_000) {
    console.log("no photo upload within 30 s of the answer")
    break
  }
}
if (!answered) console.log("machine didn't answer in time (still queued or taken)")
await mongoose.disconnect()
