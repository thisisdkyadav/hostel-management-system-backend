/**
 * Machine photos — what each face machine actually holds for a person, fetched
 * back from it, so admins can see it next to the HMS photo.
 *
 * Asking: DATA QUERY USERINFO PIN=… (SpeedFace-V5L, PUSH 3.1.6 answers -1 to
 * DATA QUERY BIOPHOTO / USERPIC and -1004 to the tablename= form). The machine
 * then uploads, before answering the command:
 *   OPERLOG  USER PIN=…                       the person
 *   BIODATA  Type=9 (face record) / Type=1     the machine made a face from the photo
 *   OPERLOG  USERPIC PIN=… Content=<jpeg>      picture shown on the screen
 *   OPERLOG  BIOPHOTO PIN=… Content=<jpeg>     the face photo (byte-identical to
 *                                              the JPEG HMS sent, captured)
 * Nothing is uploaded when the person isn't on the machine.
 *
 * A check of person P on machine M (IclockDeviceUser.check): requestedAt when
 * asked; the result is whatever came back after it — machinePhoto (and its
 * sha256 vs the HMS face) and faceTemplateAt.
 *
 * When (approach agreed with the user):
 * - a few minutes after HMS sends someone a new photo (verifies approvals);
 * - every night from 00:30 IST: people whose photo changed since their last
 *   check or who were never checked; Sunday nights: everyone;
 * - on demand from the Scanner Photos page (one student, all machines).
 * At most PHOTO_CHECKS_IN_FLIGHT per machine at a time, topped up every
 * roster tick (2 min), so a full night trickles instead of flooding.
 *
 * Files: ICLOCK_MACHINE_PHOTO_DIR (default ~/hms-iclock-photos)/<sn>/<pin>.jpg
 * (+ <pin>.userpic.jpg), overwritten on every fetch, so the folder never grows
 * past machines × people. The iclock receiver writes and the API reads them,
 * so both run on the same host (they do: one VM).
 */
import crypto from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { iclockOwner } from "./iclockOwner.service.js"
import { iclockQueries } from "./iclockQueries.service.js"
import { loadWantedRoster, ONLINE_WITHIN_MS } from "./roster.service.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../lock/distributedLock.js"

export const PHOTO_CHECKS_IN_FLIGHT = 60
/** Wait this long after HMS sent a photo before fetching it back (machine is still making the face). */
export const RECENT_SEND_DELAY_MS = 60 * 1000
const RECENT_SEND_WINDOW_MS = 24 * 60 * 60 * 1000
/** Nightly planning window, IST. */
const NIGHT_START_MIN = 30
const NIGHT_END_MIN = 6 * 60
/** A check the machine never answered counts as "no answer" after this. */
export const CHECK_STALE_MS = 30 * 60 * 1000

const key = (roll) => String(roll ?? "").trim().toUpperCase()

// ---- Files ------------------------------------------------------------------

export const machinePhotoDir = () => process.env.ICLOCK_MACHINE_PHOTO_DIR || path.join(os.homedir(), "hms-iclock-photos")

const safe = (value) => String(value || "").replace(/[^A-Za-z0-9_-]/g, "_")
const fileFor = (sn, pin, kind = "BIOPHOTO") =>
  path.join(machinePhotoDir(), safe(sn), kind === "USERPIC" ? `${safe(pin)}.userpic.jpg` : `${safe(pin)}.jpg`)

/**
 * Save the photos from an upload. BIOPHOTO (the face photo) is recorded on the
 * person's row; USERPIC (screen picture) is only kept as a file. Lines without
 * a usable image are logged (field names only, never content).
 */
export const saveMachinePhotos = async (sn, uploads) => {
  let saved = 0
  for (const upload of uploads) {
    if (!upload.pin || !upload.buffer) {
      console.warn(`[iclock] ${sn}: ${upload.kind || "photo"} upload without a usable image`, JSON.stringify(upload.fields).slice(0, 300))
      continue
    }
    const kind = upload.kind === "USERPIC" ? "USERPIC" : "BIOPHOTO"
    const file = fileFor(sn, upload.pin, kind)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, upload.buffer)
    if (kind === "BIOPHOTO") {
      const sha256 = crypto.createHash("sha256").update(upload.buffer).digest("hex")
      await iclockOwner.setMachinePhoto(sn, upload.pin, { kind, sha256, size: upload.buffer.length })
    }
    saved++
  }
  return saved
}

/** The saved machine face photo (or screen picture) bytes, or null. */
export const readMachinePhoto = async (sn, pin, kind = "BIOPHOTO") => {
  try {
    return await fs.readFile(fileFor(sn, pin, kind))
  } catch {
    return null
  }
}

// ---- Asking -----------------------------------------------------------------

export const photoQueryCommand = (pin) => `DATA QUERY USERINFO PIN=${pin}`

/** Ask one machine for one person now. `faceSha` = the HMS face at this moment ("" if none). */
export const requestPhotoCheck = async (sn, pin, { faceSha = "", createdBy = null, command } = {}) => {
  const queued = await iclockOwner.queueCommand({ sn, command: command || photoQueryCommand(pin), ref: { kind: "photo-query", key: String(pin) }, createdBy })
  await iclockOwner.setPhotoCheckRequested(sn, String(pin), { commandId: queued.commandId, faceSha })
  return queued
}

/** Kept for the probe script. */
export const requestMachinePhoto = (sn, pin, { command, createdBy = null } = {}) => requestPhotoCheck(sn, pin, { command, createdBy })

/** The receiver got the answer to a photo-query command. */
export const recordPhotoCheckAnswer = (sn, command) =>
  iclockOwner.setPhotoCheckAnswered(sn, command.ref.key, { commandId: command.commandId, returnCode: command.returnCode })

/** BIODATA upload: Type=9 records mean the machine holds a face for that person. */
export const recordFaceTemplates = (sn, records) => {
  const pins = [...new Set(records.filter((r) => String(r.Type ?? "") === "9" && (r.Pin || r.PIN)).map((r) => String(r.Pin || r.PIN).trim()))]
  return iclockOwner.setFaceTemplatesSeen(sn, pins)
}

/** "Fetch from machines" for one student: every machine with roster sync on. */
export const checkStudentOnMachines = async (rollNumber, { createdBy = null } = {}) => {
  const roll = String(rollNumber || "").trim()
  const [devices, roster] = await Promise.all([iclockQueries.listSyncDevices(), loadWantedRoster()])
  const faceSha = roster.wanted.get(key(roll))?.faceSha || ""
  for (const device of devices) await requestPhotoCheck(device.sn, roll, { faceSha, createdBy })
  return devices.length
}

// ---- Planning ---------------------------------------------------------------

/** { date: "YYYY-MM-DD", minutes, weekday } in India time. */
export const istClock = (now = Date.now()) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(new Date(now))
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday: parts.weekday }
}

/** Pure: who to check tonight on one machine. */
export const planNightlyChecks = ({ rows, wanted, full }) => {
  const byPin = new Map(rows.map((row) => [key(row.pin), row]))
  const pins = []
  for (const [k, person] of wanted) {
    const row = byPin.get(k)
    if (row?.pending?.op) continue // a photo is on its way; the recent-send check covers it
    if (full || !row?.check?.requestedAt || row.check.faceSha !== person.faceSha) pins.push(person.pin)
  }
  return pins
}

/** Pure: people HMS just sent a photo to that haven't been checked since. */
export const recentlySent = ({ rows, now }) =>
  rows.filter((row) => {
    const last = row.lastResult
    if (!last?.at || last.op !== "face" || last.ok !== true || row.pending?.op) return false
    const age = now - new Date(last.at).getTime()
    if (age < RECENT_SEND_DELAY_MS || age > RECENT_SEND_WINDOW_MS) return false
    return !row.check?.requestedAt || new Date(row.check.requestedAt) < new Date(last.at)
  })

const runMachine = async (device, roster, now) => {
  const sn = device.sn
  const clock = istClock(now)
  const rows = await iclockQueries.listPhotoCheckStates(sn)
  const result = { planned: 0, queued: 0 }

  // Nightly plan, once per IST night.
  const inWindow = clock.minutes >= NIGHT_START_MIN && clock.minutes < NIGHT_END_MIN
  if (inWindow && device.photoCheck?.lastNight !== clock.date) {
    const full = clock.weekday === "Sun" && device.photoCheck?.lastFull !== clock.date
    const pins = planNightlyChecks({ rows, wanted: roster.wanted, full })
    result.planned = pins.length
    await iclockOwner.markPhotoChecksWanted(sn, pins)
    await iclockOwner.setPhotoCheckNight(sn, { lastNight: clock.date, ...(full ? { lastFull: clock.date } : {}) })
    console.log(`📟 ${sn}: photo checks planned for ${clock.date}${full ? " (full)" : ""}: ${pins.length}`)
  }

  let room = PHOTO_CHECKS_IN_FLIGHT - (await iclockQueries.countOutstandingPhotoChecks(sn))
  if (room <= 0) return result
  const faceShaFor = (pin) => roster.wanted.get(key(pin))?.faceSha || ""

  for (const row of recentlySent({ rows, now })) {
    if (room <= 0) break
    await requestPhotoCheck(sn, row.pin, { faceSha: faceShaFor(row.pin) })
    room--
    result.queued++
  }
  if (room > 0) {
    for (const row of await iclockQueries.listWantedPhotoChecks(sn, room)) {
      await requestPhotoCheck(sn, row.pin, { faceSha: faceShaFor(row.pin) })
      result.queued++
    }
  }
  return result
}

/** The receiver's timer (after the roster sync): online machines with sync on. */
export const runDuePhotoChecks = async ({ now = Date.now(), roster = null } = {}) => {
  const devices = await iclockQueries.listSyncDevices()
  const due = devices.filter((d) => d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() <= ONLINE_WITHIN_MS)
  const results = {}
  if (!due.length) return results
  const wanted = roster || (await loadWantedRoster())
  for (const device of due) {
    try {
      const out = await withLock(`lock:iclock-photo-check:${device.sn}`, 5 * 60, () => runMachine(device, wanted, now))
      results[device.sn] = out === LOCK_NOT_ACQUIRED ? { running: true } : out
    } catch (error) {
      console.error(`[iclock] photo checks ${device.sn} failed:`, error?.message || error)
    }
  }
  return results
}

// ---- Reading ----------------------------------------------------------------

/**
 * One machine's check result for a person, against the CURRENT HMS face:
 *   none      — never checked
 *   checking  — asked, no answer yet
 *   noAnswer  — asked long ago, the machine never answered
 *   match     — the machine holds exactly the HMS photo and made a face from it
 *   noFace    — the machine holds the photo but sent no face record
 *   different — the machine holds a different photo than HMS
 *   noPhoto   — the machine sent no photo (not on it, or no photo)
 */
export const photoCheckResult = (row, faceSha, now = Date.now()) => {
  const check = row?.check
  if (!check?.requestedAt) return { status: "none" }
  const requestedAt = new Date(check.requestedAt)
  const at = check.answeredAt || check.requestedAt
  if (!check.answeredAt) return { status: now - requestedAt.getTime() > CHECK_STALE_MS ? "noAnswer" : "checking", at }
  const photo = row.machinePhoto?.at && new Date(row.machinePhoto.at) >= requestedAt
  const face = Boolean(row.faceTemplateAt && new Date(row.faceTemplateAt) >= requestedAt)
  if (!photo) return { status: "noPhoto", at, face }
  const same = Boolean(faceSha) && row.machinePhoto.sha256 === faceSha
  if (!same) return { status: "different", at, face, photo: true }
  return { status: face ? "match" : "noFace", at, face, photo: true, same: true }
}
