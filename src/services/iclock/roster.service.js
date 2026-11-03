/**
 * Roster sync — keeps each face machine's people equal to HMS's active students.
 *
 * Wanted on a machine: every Active student who has a usable HMS face (JPEG).
 * For each machine with sync switched on, a run compares that with what HMS
 * believes is on the machine (IclockDeviceUser) and queues commands:
 *
 *   add    — DATA USER + DATA UPDATE BIOPHOTO (machine downloads the HMS photo)
 *   face   — DATA UPDATE BIOPHOTO (HMS has a different photo than the machine)
 *   remove — DATA DELETE USERINFO (student no longer Active; deletes their face
 *            data from the machine too — the photo stays in HMS, so if they
 *            become Active again they're simply added back)
 *
 * Safety:
 * - Machines hold ONLY HMS's active students: anyone else on a machine (left
 *   students, people HMS doesn't know, test users) is removed.
 * - Active students are never removed, even without a photo.
 * - A run that would remove more than REMOVAL_GUARD people holds the removals
 *   back until an admin confirms (a bad status import must not wipe a machine).
 * - At most MAX_OUTSTANDING commands are in flight per machine; later runs top
 *   up, so a big first sync trickles in instead of flooding the machine.
 */
import { iclockOwner } from "./iclockOwner.service.js"
import { iclockQueries } from "./iclockQueries.service.js"
import { bioPhotoCommand, deleteUserCommand, userInfoCommand } from "./protocol.js"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { bioPhotoQueries } from "../dining/bioPhotoQueries.service.js"
import { faceUrlFor } from "../dining/scanner-faces.service.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../lock/distributedLock.js"

export const MAX_OUTSTANDING = 600
export const STALE_AFTER_MS = 30 * 60 * 1000
export const ONLINE_WITHIN_MS = 5 * 60 * 1000
export const SYNC_INTERVAL_MS = 2 * 60 * 1000
/** Removals above this (per run) wait for an admin: max(50, 5% of people on the machine). */
export const removalGuard = (onMachine) => Math.max(50, Math.ceil(onMachine * 0.05))

const key = (roll) => String(roll ?? "").trim().toUpperCase()
const ACTIVE = "Active"

// ---- What HMS wants on the machines -----------------------------------------

/**
 * { wanted: Map(KEY → { pin, name, faceSha, url }), status: Map(KEY → status),
 *   activeWithoutFace: [pin…], faces: Map(KEY → face row) }
 */
export const loadWantedRoster = async () => {
  const [profiles, faceRows] = await Promise.all([studentProfileQueries.findRosterProfiles(), bioPhotoQueries.findRosterFaces()])
  const faces = new Map(faceRows.map((row) => [key(row.rollNumber), row]))
  const status = new Map()
  const wanted = new Map()
  const activeWithoutFace = []
  for (const profile of profiles) {
    const k = key(profile.rollNumber)
    if (!k) continue
    // Duplicate roll numbers: Active wins, so a stale duplicate can't remove someone.
    if (status.get(k) !== ACTIVE) status.set(k, profile.status || "")
    if (profile.status !== ACTIVE || wanted.has(k)) continue
    const face = faces.get(k)
    const url = face ? faceUrlFor(face) : ""
    if (!url) {
      activeWithoutFace.push(String(profile.rollNumber).trim())
      continue
    }
    wanted.set(k, { pin: String(face.rollNumber).trim(), name: profile.userId?.name || face.name || "", faceSha: face.face.sha256 || face.face.ref, url })
  }
  return { wanted, status, activeWithoutFace, faces }
}

// ---- Seeding ----------------------------------------------------------------

/**
 * The machines already hold everyone EasyWDMS pushed to them. The first time
 * sync is switched on, start from EasyWDMS's employee list (DiningScannerUser
 * onScanner) so nobody is re-sent. When EasyWDMS had a photo for them, the
 * machine has the photo HMS imported from it, so its sha is assumed.
 */
export const seedRosterFromEasyWdms = async (sn) => {
  const rows = await bioPhotoQueries.findRosterFaces()
  const seeded = await iclockOwner.seedRoster(
    sn,
    rows
      .filter((row) => row.onScanner)
      .map((row) => ({
        pin: String(row.rollNumber).trim(),
        name: row.name || "",
        source: "easywdms",
        faceSha: row.bioPhoto?.present ? row.face?.sha256 || row.face?.ref || "" : "",
      })),
  )
  await iclockOwner.setSyncState(sn, { seededAt: new Date() })
  return seeded
}

// ---- Planning ---------------------------------------------------------------

/** Pure: what a run would do for one machine. */
export const planRoster = ({ rows, wanted, status }) => {
  const byKey = new Map(rows.map((row) => [key(row.pin), row]))
  const add = []
  const face = []
  const remove = []
  let inFlight = 0
  let unmanaged = 0
  let onMachine = 0

  for (const row of rows) {
    if (row.onMachine) onMachine++
    if (row.pending?.op) inFlight++
  }

  for (const [k, person] of wanted) {
    const row = byKey.get(k)
    if (row?.pending?.op) continue
    if (!row || !row.onMachine) add.push(person)
    else if (row.faceSha !== person.faceSha) face.push({ ...person, pin: row.pin })
  }

  for (const row of rows) {
    if (!row.onMachine || row.pending?.op) continue
    const k = key(row.pin)
    if (wanted.has(k)) continue
    const studentStatus = status.get(k)
    if (studentStatus === ACTIVE) continue // active without a photo: keep
    if (!studentStatus) unmanaged++ // counted for the page: on the machine but not in HMS at all
    remove.push({ pin: row.pin, name: row.name, status: studentStatus || "not in HMS" })
  }

  return { add, face, remove, inFlight, unmanaged, onMachine }
}

const summarize = (plan, extra = {}) => ({
  onMachine: plan.onMachine,
  toAdd: plan.add.length,
  toUpdateFace: plan.face.length,
  toRemove: plan.remove.length,
  inFlight: plan.inFlight,
  unmanaged: plan.unmanaged,
  ...extra,
})

/** Read-only preview for the machines page. */
export const previewRoster = async (sn) => {
  const [rows, roster] = await Promise.all([iclockQueries.listRoster(sn), loadWantedRoster()])
  const plan = planRoster({ rows, wanted: roster.wanted, status: roster.status })
  return {
    ...summarize(plan, { wanted: roster.wanted.size, activeWithoutFace: roster.activeWithoutFace.length, removalGuard: removalGuard(plan.onMachine) }),
    samples: {
      add: plan.add.slice(0, 20).map((p) => ({ pin: p.pin, name: p.name })),
      face: plan.face.slice(0, 20).map((p) => ({ pin: p.pin, name: p.name })),
      remove: plan.remove.slice(0, 20),
      activeWithoutFace: roster.activeWithoutFace.slice(0, 20),
    },
  }
}

// ---- Queuing ----------------------------------------------------------------

const queue = (sn, command, kind, pin, createdBy) => iclockOwner.queueCommand({ sn, command, ref: { kind, key: pin }, createdBy })

export const queueAdd = async (sn, person, createdBy = null) => {
  const user = await queue(sn, userInfoCommand({ pin: person.pin, name: person.name }), "roster-user", person.pin, createdBy)
  const photo = await queue(sn, bioPhotoCommand({ pin: person.pin, url: person.url }), "roster-face", person.pin, createdBy)
  await iclockOwner.setRosterPending(sn, person.pin, { op: "add", commandIds: [user.commandId, photo.commandId], faceSha: person.faceSha, name: person.name })
  return 2
}

export const queueFace = async (sn, person, createdBy = null) => {
  const photo = await queue(sn, bioPhotoCommand({ pin: person.pin, url: person.url }), "roster-face", person.pin, createdBy)
  await iclockOwner.setRosterPending(sn, person.pin, { op: "face", commandIds: [photo.commandId], faceSha: person.faceSha })
  return 1
}

export const queueRemove = async (sn, person, createdBy = null) => {
  const command = await queue(sn, deleteUserCommand({ pin: person.pin }), "roster-remove", person.pin, createdBy)
  await iclockOwner.setRosterPending(sn, person.pin, { op: "remove", commandIds: [command.commandId] })
  return 1
}

/** Called by the receiver after a devicecmd answer. */
export const applyRosterAnswer = async (sn, command) => {
  if (!command?.ref?.kind?.startsWith("roster-") || !command.ref.key) return null
  return iclockOwner.applyRosterResult(sn, command.ref.key, {
    kind: command.ref.kind,
    commandId: command.commandId,
    ok: command.returnCode === 0,
    code: command.returnCode,
  })
}

// ---- Running ----------------------------------------------------------------

const runLocked = async (sn, { allowRemovals, now, createdBy, roster: sharedRoster }) => {
  const device = await iclockQueries.findDevice(sn)
  if (!device) throw new Error(`Unknown machine ${sn}`)
  if (!device.sync?.seededAt) await seedRosterFromEasyWdms(sn)

  const staleBefore = new Date(now - STALE_AFTER_MS)
  const failed = await iclockOwner.failUnansweredCommands(sn, staleBefore)
  const expired = await iclockOwner.clearStaleRosterPending(sn, staleBefore)

  const [rows, roster, outstanding] = await Promise.all([
    iclockQueries.listRoster(sn),
    sharedRoster || loadWantedRoster(),
    iclockQueries.countOutstandingCommands(sn),
  ])
  const plan = planRoster({ rows, wanted: roster.wanted, status: roster.status })
  const guard = removalGuard(plan.onMachine)
  const removalsHeld = plan.remove.length > guard && !allowRemovals

  let budget = MAX_OUTSTANDING - outstanding
  const queued = { add: 0, face: 0, remove: 0 }
  for (const person of plan.add) {
    if (budget < 2) break
    budget -= await queueAdd(sn, person, createdBy)
    queued.add++
  }
  for (const person of plan.face) {
    if (budget < 1) break
    budget -= await queueFace(sn, person, createdBy)
    queued.face++
  }
  if (!removalsHeld) {
    for (const person of plan.remove) {
      if (budget < 1) break
      budget -= await queueRemove(sn, person, createdBy)
      queued.remove++
    }
  }

  const result = {
    at: new Date(now),
    ...summarize(plan, { wanted: roster.wanted.size, activeWithoutFace: roster.activeWithoutFace.length }),
    queued,
    removalsHeld: removalsHeld ? plan.remove.length : 0,
    removalGuard: guard,
    expired,
    unanswered: failed.length,
  }
  await iclockOwner.setSyncState(sn, { lastRunAt: new Date(now), lastResult: result })
  return result
}

/** One sync run for one machine. Returns the run result, or { running: true }. */
export const runRosterSync = async (sn, { allowRemovals = false, now = Date.now(), createdBy = null, roster = null } = {}) => {
  const result = await withLock(`lock:iclock-roster:${sn}`, 10 * 60, () => runLocked(sn, { allowRemovals, now, createdBy, roster }))
  return result === LOCK_NOT_ACQUIRED ? { running: true } : result
}

/** The receiver's timer: every machine with sync on that has polled recently. */
export const runDueRosterSyncs = async ({ now = Date.now() } = {}) => {
  const devices = await iclockQueries.listSyncDevices()
  const results = {}
  const due = devices.filter((d) => d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() <= ONLINE_WITHIN_MS)
  if (!due.length) return results
  const roster = await loadWantedRoster() // once for all machines
  for (const device of due) {
    try {
      results[device.sn] = await runRosterSync(device.sn, { now, roster })
    } catch (error) {
      console.error(`[iclock] roster sync ${device.sn} failed:`, error?.message || error)
      await iclockOwner.setSyncState(device.sn, { lastRunAt: new Date(now), lastResult: { at: new Date(now), error: String(error?.message || error) } })
    }
  }
  return results
}

// ---- One person (manual / proof of concept) --------------------------------

/** Push one student (user + face) to one machine now, whatever sync says. */
export const pushPerson = async (sn, rollNumber, createdBy = null) => {
  const { wanted, faces, status } = await loadWantedRoster()
  const k = key(rollNumber)
  const person = wanted.get(k)
  if (person) {
    await queueAdd(sn, person, createdBy)
    return { ok: true, pin: person.pin }
  }
  const face = faces.get(k)
  if (!face) return { ok: false, message: "HMS has no face photo for that roll number" }
  const url = faceUrlFor(face)
  if (!url) return { ok: false, message: face.face?.ref ? "That photo isn't a JPG, so machines can't use it yet" : "HMS has no face photo for that roll number" }
  if (status.get(k) && status.get(k) !== ACTIVE) return { ok: false, message: `That student is ${status.get(k)}` }
  await queueAdd(sn, { pin: String(face.rollNumber).trim(), name: face.name || "", faceSha: face.face.sha256 || face.face.ref, url }, createdBy)
  return { ok: true, pin: String(face.rollNumber).trim() }
}

/** Remove one person from one machine now. */
export const removePerson = async (sn, rollNumber, createdBy = null) => {
  const pin = String(rollNumber ?? "").trim()
  if (!pin) return { ok: false, message: "Enter a roll number" }
  await queueRemove(sn, { pin }, createdBy)
  return { ok: true, pin }
}

/** Ask the machine to upload its people list (handled as USER records on cdata). */
export const QUERY_USERS_COMMAND = "DATA QUERY USERINFO"
export const requestMachineUsers = (sn, createdBy = null) => queue(sn, QUERY_USERS_COMMAND, "roster-query", "", createdBy)

/** USER records from an upload (OPERLOG / USERINFO) → mark those people as on the machine. */
export const recordMachineUsers = async (sn, records) => {
  const people = records
    .filter((r) => (r._type === "USER" || r._type === undefined) && r.PIN)
    .map((r) => ({ pin: String(r.PIN).trim(), name: String(r.Name || "").trim() }))
    .filter((p) => p.pin)
  return people.length ? iclockOwner.markOnMachine(sn, people) : 0
}
