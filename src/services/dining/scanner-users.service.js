/**
 * Scanner photos
 * --------------
 * The face photo each ACTIVE student has for the mess face machines, and
 * whether every machine has it. Everything here comes from HMS itself:
 *
 * - the face HMS keeps (DiningScannerUser.face; stored by scanner-faces),
 * - what each machine with roster sync on holds (IclockDeviceUser: on the
 *   machine with this exact photo, waiting for it, or refused it).
 *
 * Who is on the machines is decided by the roster sync (active students with a
 * photo), so there is nothing to add here. The actions only give a student a
 * photo: their HMS profile photo, one at a time or for everyone without one.
 * A new photo reaches the machines through the roster sync, which is nudged
 * right away instead of waiting for its 2-minute timer.
 *
 * Writes: bioPhotoOwner, configOwner (via scanner-faces). Reads: bioPhotoQueries,
 * studentProfileQueries, iclockQueries, configQueries.
 */

import { success, badRequest, notFound, conflict } from "../base/index.js"
import { logger } from "../base/Logger.js"
import { bioPhotoOwner } from "./bioPhotoOwner.service.js"
import { bioPhotoQueries } from "./bioPhotoQueries.service.js"
import { readFace, storeScannerFace } from "./scanner-faces.service.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { iclockQueries } from "../iclock/iclockQueries.service.js"
import { refusedPhoto, runDueRosterSyncs } from "../iclock/roster.service.js"
import { checkStudentOnMachines, photoCheckResult, readMachinePhoto } from "../iclock/machine-photos.service.js"
import { configOwner } from "../config/configOwner.service.js"
import { configQueries } from "../config/configQueries.service.js"
import { withLock } from "../lock/distributedLock.js"

export const PROFILE_JOB_CONFIG_KEY = "diningScannerProfileJob"
const PROFILE_JOB_LOCK = "lock:dining-scanner-profile-photos"

export const PHOTO_STATUSES = ["valid", "pending", "failed", "missing"]
/** What the machines sent back when asked (fetch-back checks), summed over machines. */
export const CHECK_SUMMARIES = ["match", "mismatch", "noFace", "checking", "unchecked"]
const LIST_FILTERS = ["all", ...PHOTO_STATUSES, ...CHECK_SUMMARIES]
/**
 * Does the student's face work at the mess, and if not, why. A machine holding
 * a different photo than HMS still works when it made a face, so that is not a
 * problem; a machine with no photo at all counts as "no face".
 * A face scan at any machine since the current photo was saved is proof the
 * face works: it outranks what the photo checks say (they can miss the face
 * record or the photo), except a refusal, which still needs a new photo.
 */
export const REASONS = ["noPhoto", "refused", "noFace", "sending", "unchecked", "working"]
export const NOT_WORKING = REASONS.filter((reason) => reason !== "working")
const REASON_FILTERS = ["notWorking", ...REASONS]

export const reasonOf = (photoStatus, checks, { scanned = false } = {}) => {
  if (photoStatus === "missing") return "noPhoto"
  if (photoStatus === "failed") return "refused"
  if (scanned) return "working"
  const statuses = checks.map((check) => check?.status || "none")
  if (statuses.some((s) => s === "noFace" || s === "noPhoto")) return "noFace"
  if (photoStatus === "pending") return "sending"
  if (statuses.every((s) => s === "match" || s === "different")) return "working"
  return "unchecked"
}
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 10
/** A machine polls every few seconds; quiet for this long means it's off or unreachable. */
const MACHINE_ONLINE_MS = 5 * 60_000

const idOf = (value) => String(value?._id || value || "")
const key = (roll) => String(roll ?? "").trim().toUpperCase()
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const readState = async (configKey) => (await configQueries.findByKeyLean(configKey))?.value || null
const writeState = (configKey, value) => configOwner.upsertConfig({ key: configKey }, { key: configKey, value })

/** Ask the roster sync to run now (it also runs every 2 minutes). Never throws. */
export const nudgeRosterSync = () => {
  runDueRosterSyncs().catch((caught) => logger.warn?.(`[scanner-photos] roster sync nudge failed: ${caught?.message || caught}`))
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** The sha the roster sync sends for this face ("" when the machines can't use it). */
const faceShaOf = (face) => (face?.ref && face.contentType === "image/jpeg" ? face.sha256 || face.ref : "")

/**
 * One machine's view of one student's current photo:
 *   ok       — on the machine with this exact photo
 *   refused  — the machine said no to this photo (a new photo is needed)
 *   waiting  — not there yet (queued, in flight, or the machine was offline)
 */
export const machineState = (row, faceSha) => {
  if (row?.onMachine && row.faceSha === faceSha && !row.pending?.op) return "ok"
  if (refusedPhoto(row, faceSha)) return "refused"
  return "waiting"
}

/** valid | pending | failed | missing from a face and each machine's state. */
export const derivePhotoStatus = (faceSha, states) => {
  if (!faceSha) return "missing"
  if (states.some((state) => state === "refused")) return "failed"
  if (states.every((state) => state === "ok")) return "valid"
  return "pending"
}

/**
 * One word for what every machine sent back for this student's current photo
 * (null without a photo or machines). Worst first:
 *   mismatch  — a machine holds another photo, or none at all
 *   noFace    — a machine holds this photo but made no face from it
 *   checking  — asked, waiting for an answer
 *   unchecked — at least one machine never checked (or didn't answer)
 *   match     — every machine holds this exact photo and made a face
 */
export const summarizeChecks = (checks) => {
  if (!checks.length) return null
  const statuses = checks.map((check) => check?.status || "none")
  if (statuses.some((s) => s === "different" || s === "noPhoto")) return "mismatch"
  if (statuses.includes("noFace")) return "noFace"
  if (statuses.includes("checking")) return "checking"
  if (statuses.every((s) => s === "match")) return "match"
  return "unchecked"
}

/** Machines with roster sync on: { sn, alias }. */
const syncMachines = async () => {
  const devices = await iclockQueries.listSyncDevices()
  return devices
    .map((device) => ({ sn: device.sn, alias: device.alias || device.sn, lastSeenAt: device.lastSeenAt || null }))
    .sort((a, b) => a.alias.localeCompare(b.alias))
}

const FACE_SOURCES = { request: "Student upload", profile: "Profile photo", easywdms: "Imported from EasyWDMS" }

/** Everything the page shows for one student. */
const buildEntry = ({ profile, row, machines, statesByPin, scans }) => {
  const rollNumber = String(profile.rollNumber).trim()
  const face = row?.face?.ref ? row.face : null
  const faceSha = faceShaOf(face)
  const held = statesByPin.get(key(rollNumber)) || new Map()
  const scansHere = scans.get(key(rollNumber)) || new Map()
  // Face scans count only from the moment the current photo was saved.
  const scannedOn = (sn) => {
    const at = scansHere.get(sn)
    return at && face?.storedAt && new Date(at) >= new Date(face.storedAt) ? at : null
  }
  const perMachine = machines.map((machine) => {
    const machineRow = held.get(machine.sn)
    const state = faceSha ? machineState(machineRow, faceSha) : "none"
    const result = machineRow?.lastResult || {}
    // What the machine said when it refused (ERRORLOG code/message, or its non-zero answer).
    const refusal =
      state === "refused"
        ? { code: result.error || (result.code != null ? String(result.code) : ""), message: result.message || "The machine didn't accept this photo", at: result.at || null }
        : null
    return { alias: machine.alias, sn: machine.sn, state, refusal, check: photoCheckResult(machineRow, faceSha), scannedAt: scannedOn(machine.sn) }
  })
  const latest = perMachine.filter((machine) => machine.scannedAt).sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt))[0]
  const status = derivePhotoStatus(faceSha, perMachine.map((machine) => machine.state))
  return {
    rollNumber,
    name: profile.userId?.name || "",
    studentUserId: idOf(profile.userId),
    profileImage: profile.userId?.profileImage || "",
    photoStatus: status,
    checkSummary: faceSha ? summarizeChecks(perMachine.map((machine) => machine.check)) : null,
    reason: reasonOf(status, perMachine.map((machine) => machine.check), { scanned: Boolean(latest) }),
    photo: face
      ? { present: true, source: face.source || "", sourceLabel: FACE_SOURCES[face.source] || "", storedAt: face.storedAt || null, width: face.width || 0, height: face.height || 0, version: (face.sha256 || face.ref).slice(0, 12) }
      : { present: false },
    machines: perMachine,
    profileAttempt: row?.profileAttempt?.at ? { at: row.profileAttempt.at, outcome: row.profileAttempt.outcome, message: row.profileAttempt.message || "" } : null,
    lastScan: latest ? { at: latest.scannedAt, machine: latest.alias } : null,
  }
}

/** Every active student (or one roll) with their photo and machine states. */
const loadBoard = async ({ rollNumber } = {}) => {
  const [profiles, rows, machines] = await Promise.all([
    studentProfileQueries.findActivePhotoProfiles({ rollNumber }),
    bioPhotoQueries.findPhotoBoardRows({ rollNumber }),
    syncMachines(),
  ])
  const rowByRoll = new Map(rows.map((row) => [key(row.rollNumber), row]))
  const states = machines.length ? await iclockQueries.listRosterStates(machines.map((machine) => machine.sn), rollNumber ? { pin: rollNumber } : {}) : []
  // Face scans since the oldest current photo (each student's own photo date is checked in buildEntry).
  const oldestPhoto = rows.reduce((min, row) => (row.face?.storedAt && (!min || row.face.storedAt < min) ? row.face.storedAt : min), null)
  const scans = oldestPhoto ? await iclockQueries.lastFaceScans({ since: oldestPhoto, pin: rollNumber }) : new Map()
  const statesByPin = new Map()
  for (const state of states) {
    const k = key(state.pin)
    if (!statesByPin.has(k)) statesByPin.set(k, new Map())
    statesByPin.get(k).set(state.sn, state)
  }
  const seen = new Set()
  const entries = []
  for (const profile of profiles) {
    const k = key(profile.rollNumber)
    if (!k || seen.has(k)) continue
    seen.add(k)
    entries.push(buildEntry({ profile, row: rowByRoll.get(k), machines, statesByPin, scans }))
  }
  entries.sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))
  return { entries, machines }
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max ? Math.min(parsed, max) : parsed
}

const matchesFilter = (entry, filter) => filter === "all" || entry.photoStatus === filter || entry.checkSummary === filter
const matchesReason = (entry, reason) => !reason || entry.reason === reason || (reason === "notWorking" && entry.reason !== "working")

/** Search ranks exact roll, then roll prefix, then name/roll containing it. */
const searchRank = (entry, search) => {
  const roll = key(entry.rollNumber)
  const wanted = key(search)
  if (roll === wanted) return 0
  if (roll.startsWith(wanted)) return 1
  if (entry.name.toUpperCase().startsWith(wanted)) return 2
  return 3
}

/**
 * Students by search (roll or name) and/or filter, 10 a page by default.
 * The page asks only once something is typed or a filter is picked.
 */
export const listScannerUsers = async ({ query = {} }) => {
  const status = query.status === undefined || query.status === "" ? "all" : query.status
  if (!LIST_FILTERS.includes(status)) return badRequest(`status must be one of ${LIST_FILTERS.join(", ")}`)
  const reason = typeof query.reason === "string" ? query.reason : ""
  if (reason && !REASON_FILTERS.includes(reason)) return badRequest(`reason must be one of ${REASON_FILTERS.join(", ")}`)
  const page = parsePositiveInt(query.page, 1)
  const limit = parsePositiveInt(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 60) : ""

  const { entries, machines } = await loadBoard()
  const counts = { all: entries.length, valid: 0, pending: 0, failed: 0, missing: 0 }
  for (const entry of entries) counts[entry.photoStatus]++

  const pattern = search ? new RegExp(escapeRegex(search), "i") : null
  let filtered = entries.filter((entry) => matchesFilter(entry, status) && matchesReason(entry, reason) && (!pattern || pattern.test(entry.rollNumber) || pattern.test(entry.name)))
  if (search) filtered = filtered.map((entry) => [searchRank(entry, search), entry]).sort((a, b) => a[0] - b[0]).map(([, entry]) => entry)
  return success({
    items: filtered.slice((page - 1) * limit, page * limit),
    total: filtered.length,
    page,
    limit,
    counts,
    machines: machines.map((machine) => machine.alias),
  })
}

/** One student (the detail view). */
export const getScannerUser = async ({ rollNumber }) => {
  const roll = typeof rollNumber === "string" ? rollNumber.trim() : ""
  const [item] = roll ? (await loadBoard({ rollNumber: roll })).entries : []
  if (!item) return notFound(`No active student with roll number ${roll}.`)
  return success({ item })
}

/**
 * The overview: how many active students have a photo every machine took,
 * what's on its way or refused, what the machines sent back, and each
 * machine's own tally.
 */
export const getScannerStats = async () => {
  const [{ entries, machines }, profileJob] = await Promise.all([loadBoard(), readState(PROFILE_JOB_CONFIG_KEY)])
  const status = { valid: 0, pending: 0, failed: 0, missing: 0 }
  const checks = Object.fromEntries(CHECK_SUMMARIES.map((name) => [name, 0]))
  const reasons = Object.fromEntries(REASONS.map((name) => [name, 0]))
  const perMachine = machines.map((machine) => ({ alias: machine.alias, sn: machine.sn, lastSeenAt: machine.lastSeenAt, ok: 0, waiting: 0, refused: 0, match: 0, lastCheckAt: null }))
  let missingWithProfile = 0
  let notWorkingWithProfile = 0
  let scannedSinceUpdate = 0
  for (const entry of entries) {
    if (entry.lastScan) scannedSinceUpdate++
    if (isProfileCandidate(entry, { includeNotWorking: true }) && entry.photoStatus !== "missing") notWorkingWithProfile++
    status[entry.photoStatus]++
    if (entry.checkSummary) checks[entry.checkSummary]++
    reasons[entry.reason]++
    if (entry.photoStatus === "missing" && isProfileCandidate(entry)) missingWithProfile++
    entry.machines.forEach((machine, index) => {
      const tally = perMachine[index]
      if (machine.state in tally) tally[machine.state]++
      if (machine.check?.status === "match") tally.match++
      if (machine.check?.at && (!tally.lastCheckAt || new Date(machine.check.at) > new Date(tally.lastCheckAt))) tally.lastCheckAt = machine.check.at
    })
  }
  const now = Date.now()
  for (const tally of perMachine) tally.online = Boolean(tally.lastSeenAt && now - new Date(tally.lastSeenAt).getTime() < MACHINE_ONLINE_MS)
  return success({
    total: entries.length,
    withPhoto: entries.length - status.missing,
    status,
    checks,
    reasons,
    notWorking: entries.length - reasons.working,
    missingWithProfile,
    notWorkingWithProfile,
    scannedSinceUpdate,
    machines: perMachine,
    profileJob,
  })
}

// ---------------------------------------------------------------------------
// Profile photo → scanner photo
// ---------------------------------------------------------------------------

/** The student's HMS profile photo bytes, or { problem }. */
const readProfilePhoto = async (profileImage) => {
  if (!profileImage) return { problem: "No profile photo in HMS." }
  try {
    const { buffer } = await fileAccessService.getBuffer(profileImage)
    return { buffer }
  } catch {
    return { problem: "The profile photo couldn't be read." }
  }
}

const recordAttempt = (rollNumber, actor, outcome, message, extra = {}) =>
  bioPhotoOwner.upsertScannerUser(rollNumber, { ...extra, profileAttempt: { at: new Date(), by: actor?._id || null, outcome, message } })

/** Store one student's profile photo as their face. { outcome: "sent"|"unusable", message }. */
const applyProfilePhoto = async ({ rollNumber, studentUserId, name, profileImage, actor }) => {
  const base = { name: name || rollNumber, studentUserId: studentUserId || null }
  const upload = await readProfilePhoto(profileImage)
  if (upload.problem) {
    await recordAttempt(rollNumber, actor, "unusable", upload.problem, base)
    return { outcome: "unusable", message: upload.problem }
  }
  const stored = await storeScannerFace({ rollNumber, buffer: upload.buffer, source: "profile", actorId: idOf(actor?._id), fields: base })
  if (!stored.ok) {
    const message = `Profile photo can't be used: ${stored.problem}`
    await recordAttempt(rollNumber, actor, "unusable", message, base)
    return { outcome: "unusable", message }
  }
  await recordAttempt(rollNumber, actor, "sent", "Sent to the machines.")
  return { outcome: "sent", message: "Saved. The machines get it within a couple of minutes." }
}

/**
 * Use one active student's profile photo as their scanner photo. A photo that
 * already works on every machine is kept unless body.replace is true.
 */
export const tryProfilePhoto = async ({ rollNumber: rawRoll, body = {}, actor }) => {
  const roll = typeof rawRoll === "string" ? rawRoll.trim() : ""
  if (!roll) return badRequest("Enter a roll number.")
  const [entry] = (await loadBoard({ rollNumber: roll })).entries
  if (!entry?.studentUserId) return notFound(`No active student with roll number ${roll}.`)
  if (entry.photoStatus === "valid" && body.replace !== true) return conflict("This student's photo already works on every machine.")

  const result = await applyProfilePhoto({ ...entry, actor })
  if (result.outcome === "sent") nudgeRosterSync()
  const [item] = (await loadBoard({ rollNumber: entry.rollNumber })).entries
  return success({ item, outcome: result.outcome }, 200, result.message)
}

/** Reasons whose photo doesn't work and won't fix itself (not sending, not just unchecked). */
const BROKEN_REASONS = new Set(["refused", "noFace"])

/**
 * Who the bulk run gives their profile photo: everyone with no photo and no
 * earlier try; with includeNotWorking, also everyone whose photo a machine
 * refused or made no face from, unless that photo already is the profile photo
 * or the profile photo was found unusable before.
 */
const isProfileCandidate = (entry, { includeNotWorking = false } = {}) => {
  if (!entry.profileImage) return false
  if (entry.photoStatus === "missing") return !entry.profileAttempt
  if (!includeNotWorking || !BROKEN_REASONS.has(entry.reason)) return false
  return entry.photo.source !== "profile" && entry.profileAttempt?.outcome !== "unusable"
}

const profilePhotoCandidates = async (options) => {
  const { entries } = await loadBoard()
  return entries.filter((entry) => isProfileCandidate(entry, options))
}

const runProfilePhotoJob = async (actor, candidates) => {
  const state = { running: true, startedAt: new Date(), finishedAt: null, total: candidates.length, done: 0, sent: 0, unusable: 0, failed: 0, error: "" }
  await writeState(PROFILE_JOB_CONFIG_KEY, state)
  for (const entry of candidates) {
    try {
      const result = await applyProfilePhoto({ ...entry, actor })
      state[result.outcome === "sent" ? "sent" : "unusable"]++
    } catch (caught) {
      state.failed++
      state.error = String(caught?.message || caught).slice(0, 300)
      await recordAttempt(entry.rollNumber, actor, "failed", "Couldn't save the photo.").catch(() => {})
    }
    state.done++
    if (state.done % 10 === 0) await writeState(PROFILE_JOB_CONFIG_KEY, state)
  }
  Object.assign(state, { running: false, finishedAt: new Date() })
  await writeState(PROFILE_JOB_CONFIG_KEY, state)
  logger.info?.(`[scanner-photos] profile photos: ${state.sent} saved, ${state.unusable} unusable, ${state.failed} failed of ${state.total}`)
  if (state.sent) nudgeRosterSync()
  return state
}

/** Start the bulk run in the background; 409 while one runs. */
export const startProfilePhotoJob = async ({ actor, body = {} }) => {
  const current = await readState(PROFILE_JOB_CONFIG_KEY)
  if (current?.running && Date.now() - new Date(current.startedAt).getTime() < 2 * 60 * 60 * 1000) return conflict("Profile photos are already being saved.")
  const includeNotWorking = body.includeNotWorking === true
  const candidates = await profilePhotoCandidates({ includeNotWorking })
  if (!candidates.length) return badRequest("Nobody needs a profile photo tried: everyone in that group has been tried already, or has no profile photo.")

  withLock(PROFILE_JOB_LOCK, 2 * 60 * 60, () => runProfilePhotoJob(actor, candidates)).catch((caught) => {
    logger.warn?.(`[scanner-photos] profile photo run failed: ${caught?.message || caught}`)
    writeState(PROFILE_JOB_CONFIG_KEY, { running: false, finishedAt: new Date(), error: String(caught?.message || caught) }).catch(() => {})
  })
  return success({ started: true, total: candidates.length }, 202, `Saving profile photos for ${candidates.length} students`)
}

// ---------------------------------------------------------------------------
// Photo + student view
// ---------------------------------------------------------------------------

/** The stored face bytes for display, or null. */
export const getScannerPhoto = async ({ rollNumber }) => readFace(rollNumber)

/**
 * What a student sees on their Dining page: does every machine have their
 * current photo? null when no machine is kept in sync yet.
 */
export const getStudentScannerStatus = async (rollNumber) => {
  const roll = String(rollNumber || "").trim()
  if (!roll) return null
  const { entries, machines } = await loadBoard({ rollNumber: roll })
  if (!machines.length) return null
  const entry = entries[0]
  if (!entry) return { status: "notOnScanner", machines: { total: machines.length, accepted: 0, rejected: 0, waiting: 0 }, checkedAt: new Date() }
  const states = entry.machines.map((machine) => machine.state)
  return {
    status: entry.photoStatus,
    machines: {
      total: machines.length,
      accepted: states.filter((state) => state === "ok").length,
      rejected: states.filter((state) => state === "refused").length,
      waiting: states.filter((state) => state === "waiting").length,
    },
    checkedAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// What the machines hold (fetched back from them)
// ---------------------------------------------------------------------------

/** "Fetch from machines": ask every synced machine for this student now. */
export const checkOnMachines = async ({ rollNumber, actor }) => {
  const roll = typeof rollNumber === "string" ? rollNumber.trim() : ""
  const [entry] = roll ? (await loadBoard({ rollNumber: roll })).entries : []
  if (!entry) return notFound(`No active student with roll number ${roll}.`)
  const asked = await checkStudentOnMachines(entry.rollNumber, { createdBy: actor?._id || null })
  if (!asked) return badRequest("No machine is kept in sync yet.")
  const [item] = (await loadBoard({ rollNumber: entry.rollNumber })).entries
  return success({ item }, 202, `Asked ${asked} machine${asked === 1 ? "" : "s"}. Their photos show here within a minute or two.`)
}

/** The face photo a machine sent back for this student (`machine` = sn or alias). */
export const getMachinePhoto = async ({ rollNumber, machine }) => {
  const roll = String(rollNumber || "").trim()
  const wanted = String(machine || "").trim()
  if (!roll || !wanted) return null
  const target = (await syncMachines()).find((m) => m.sn === wanted || m.alias === wanted)
  if (!target) return null
  const buffer = await readMachinePhoto(target.sn, roll)
  return buffer ? { buffer, contentType: "image/jpeg" } : null
}
