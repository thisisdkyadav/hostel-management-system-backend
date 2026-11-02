/**
 * Face-scanner users
 * ------------------
 * HMS keeps a small copy of everyone on the face scanners (EasyWDMS
 * employees, emp_code = roll number): name, roll number, whether they have a
 * bio photo and what each machine said about it. The photo stays in EasyWDMS.
 *
 * - Nightly sync (from 03:00, once a day) and "Sync now" rebuild the copy from
 *   EasyWDMS: employees, bio photos and the machines' answers to bio-photo
 *   commands.
 * - Add by roll number: the student must be in HMS; they're created as an
 *   EasyWDMS employee in every machine area.
 * - Use profile photo: sends the student's HMS profile photo as their bio
 *   photo and waits briefly for the machines to accept or reject it.
 *
 * Writes: bioPhotoOwner, configOwner. Reads: bioPhotoQueries, configQueries,
 * studentProfileQueries, userQueries. EasyWDMS: easywdms.client.
 */

import { success, created, badRequest, notFound, conflict, error as errorResponse } from "../base/index.js"
import { logger } from "../base/Logger.js"
import { bioPhotoOwner } from "./bioPhotoOwner.service.js"
import { bioPhotoQueries } from "./bioPhotoQueries.service.js"
import { validateBioPhotoBuffer } from "./bioPhotoImage.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { userQueries } from "../user/userQueries.service.js"
import { configOwner } from "../config/configOwner.service.js"
import { configQueries } from "../config/configQueries.service.js"
import { withLock, LOCK_NOT_ACQUIRED } from "../lock/distributedLock.js"
import { EasyWdmsError, getEasyWdmsClient, isScannerRollNumber } from "../easywdms/easywdms.client.js"

export const SYNC_CONFIG_KEY = "diningScannerSync"
export const PROFILE_JOB_CONFIG_KEY = "diningScannerProfileJob"
export const SCANNER_SYNC_HOUR = 3
const SYNC_LOCK = "lock:dining-scanner-sync"
const PROFILE_JOB_LOCK = "lock:dining-scanner-profile-job"
const LIST_FILTERS = ["all", "valid", "pending", "failed", "missing", "notInHms"]
const MAX_PAGE_SIZE = 100
const WAIT_FOR_MACHINES_MS = 25_000
const POLL_EVERY_MS = 3_000
const REFRESH_AFTER_APPROVAL_MS = 90_000

const idOf = (value) => String(value?._id || value || "")
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const dayKeyLocal = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const scannerError = (caught) => (caught instanceof EasyWdmsError ? caught.message : "Something went wrong talking to the face scanner software")

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * valid / pending / failed / missing from the bio photo and the machines'
 * latest answers (see DiningScannerUser.model.js).
 */
export const derivePhotoStatus = (photo, devices = []) => {
  if (!photo?.path) return "missing"
  const approval = String(photo.approval || "").toLowerCase()
  if (approval.includes("reject")) return "failed"
  if (devices.some((device) => device.ok === false)) return "failed"
  if (approval.includes("pending") || devices.some((device) => device.ok === null)) return "pending"
  return "valid"
}

/** Latest bio-photo command per machine for each roll number (commands newest first). */
export const latestDeviceResults = (commands) => {
  const byCode = new Map()
  for (const command of [...commands].sort((a, b) => b.id - a.id)) {
    const devices = byCode.get(command.code) || new Map()
    if (!devices.has(command.sn)) {
      devices.set(command.sn, { sn: command.sn, alias: command.alias, ok: command.ok, message: command.message, commandId: command.id, at: command.at })
    }
    byCode.set(command.code, devices)
  }
  return new Map([...byCode].map(([code, devices]) => [code, [...devices.values()].sort((a, b) => a.alias.localeCompare(b.alias))]))
}

const photoFields = (photo) => ({
  present: Boolean(photo?.path),
  approval: photo?.approval || "",
  path: photo?.path || "",
  registeredAt: photo?.registeredAt || "",
})

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

const readState = async (key) => (await configQueries.findByKeyLean(key))?.value || null
const writeState = (key, value) => configOwner.upsertConfig({ key }, { key, value })

/** HMS profiles for roll numbers → Map(roll → { userId, name }). */
const hmsStudentsByRoll = async (rollNumbers) => {
  const map = new Map()
  for (let index = 0; index < rollNumbers.length; index += 2000) {
    const profiles = await studentProfileQueries.findByRollNumbers(rollNumbers.slice(index, index + 2000), {
      select: "rollNumber userId",
      populate: { path: "userId", select: "name" },
      lean: true,
    })
    for (const profile of profiles) map.set(String(profile.rollNumber), { userId: profile.userId?._id || profile.userId || null, name: profile.userId?.name || "" })
  }
  return map
}

/**
 * Rebuild the copy from EasyWDMS. One sync at a time (cluster-wide); returns
 * the saved sync state, or { running: true } when another sync holds the lock.
 */
export const syncScannerUsers = async ({ trigger = "manual" } = {}) => {
  const client = getEasyWdmsClient()
  if (!client.configured) return { ok: false, error: "The face scanner software isn't connected yet" }

  const result = await withLock(SYNC_LOCK, 15 * 60, async () => {
    const startedAt = new Date()
    const previous = (await readState(SYNC_CONFIG_KEY)) || {}
    await writeState(SYNC_CONFIG_KEY, { ...previous, running: true, startedAt })
    try {
      const [employees, photos, commands] = [await client.listEmployees(), await client.listBioPhotos(), await client.listBioPhotoCommands()]
      const photoByCode = new Map(photos.map((photo) => [photo.code, photo]))
      const resultsByCode = latestDeviceResults(commands)
      const codes = [...new Set(employees.map((employee) => employee.code).filter(Boolean))]
      const [students, existingRows] = await Promise.all([hmsStudentsByRoll(codes), bioPhotoQueries.findScannerUsersByRoll(codes)])
      const existingByRoll = new Map(existingRows.map((row) => [row.rollNumber, row]))
      const now = new Date()

      const rows = employees
        .filter((employee) => employee.code)
        .map((employee) => {
          const photo = photoByCode.get(employee.code) || null
          const student = students.get(employee.code)
          const previousRow = existingByRoll.get(employee.code)
          let devices = resultsByCode.get(employee.code)
          let devicesChecked = Boolean(devices?.length)
          // Command history is short; keep earlier answers while the photo is unchanged.
          if (!devicesChecked && previousRow?.devicesChecked && previousRow.bioPhoto?.registeredAt === (photo?.registeredAt || "") && photo) {
            devices = previousRow.devices
            devicesChecked = true
          }
          devices = devices || []
          return {
            rollNumber: employee.code,
            set: {
              name: student?.name || employee.name || "",
              studentUserId: student?.userId || null,
              onScanner: true,
              bioPhoto: photoFields(photo),
              devices,
              devicesChecked,
              photoStatus: derivePhotoStatus(photo, devices),
              syncedAt: now,
            },
          }
        })

      await bioPhotoOwner.upsertScannerUsers(rows)
      const removed = await bioPhotoOwner.markOffScanner(codes, now)
      const counts = await bioPhotoQueries.countScannerUsers()
      const state = { running: false, ok: true, error: "", trigger, lastRunAt: now, startedAt, durationMs: Date.now() - startedAt.getTime(), counts, removed }
      await writeState(SYNC_CONFIG_KEY, state)
      logger.info?.(`[scanner-users] ${trigger} sync: ${counts.all} on scanner, ${counts.valid} valid, ${counts.missing} missing, ${counts.failed} failed`)
      return state
    } catch (caught) {
      const state = { ...previous, running: false, ok: false, error: scannerError(caught), trigger, lastRunAt: new Date(), startedAt }
      await writeState(SYNC_CONFIG_KEY, state)
      logger.warn?.(`[scanner-users] ${trigger} sync failed: ${caught?.message || caught}`)
      return state
    }
  })
  return result === LOCK_NOT_ACQUIRED ? { running: true } : result
}

/** Scheduler hook: once a day from 03:00 local. */
export const runDueScannerSync = async ({ now = new Date() } = {}) => {
  if (now.getHours() < SCANNER_SYNC_HOUR || !getEasyWdmsClient().configured) return null
  return withLock(`lock:cron:dining-scanner-sync:${dayKeyLocal(now)}`, 26 * 60 * 60, () => syncScannerUsers({ trigger: "nightly" }), { release: false })
}

/** "Sync now": starts in the background; 409 while one is running. */
export const startScannerSync = async () => {
  if (!getEasyWdmsClient().configured) return errorResponse("The face scanner software isn't connected yet.", 503)
  const state = await readState(SYNC_CONFIG_KEY)
  if (state?.running && Date.now() - new Date(state.startedAt).getTime() < 15 * 60 * 1000) return conflict("A sync is already running. Refresh in a minute.")
  syncScannerUsers({ trigger: "manual" }).catch((caught) => logger.warn?.(`[scanner-users] manual sync failed: ${caught?.message || caught}`))
  return success({ started: true }, 202, "Sync started")
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const parsePositiveInt = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return max ? Math.min(parsed, max) : parsed
}

const serializeScannerUser = (row, user) => ({
  rollNumber: row.rollNumber,
  name: row.name || user?.name || "",
  inHms: Boolean(row.studentUserId),
  studentUserId: row.studentUserId ? idOf(row.studentUserId) : "",
  profileImage: user?.profileImage || "",
  photoStatus: row.photoStatus,
  bioPhoto: { present: Boolean(row.bioPhoto?.present), approval: row.bioPhoto?.approval || "", registeredAt: row.bioPhoto?.registeredAt || "" },
  devices: (row.devices || []).map((device) => ({ alias: device.alias || device.sn, ok: device.ok ?? null, message: device.message || "", at: device.at || "" })),
  devicesChecked: Boolean(row.devicesChecked),
  profileAttempt: row.profileAttempt?.at ? { at: row.profileAttempt.at, outcome: row.profileAttempt.outcome, message: row.profileAttempt.message || "" } : null,
  addedAt: row.addedAt || null,
  syncedAt: row.syncedAt || null,
})

const withUsers = async (rows) => {
  const userIds = [...new Set(rows.map((row) => idOf(row.studentUserId)).filter(Boolean))]
  const users = userIds.length ? await userQueries.findUsers({ _id: { $in: userIds } }, { select: "name profileImage", lean: true }) : []
  const byId = new Map(users.map((user) => [idOf(user), user]))
  return rows.map((row) => serializeScannerUser(row, byId.get(idOf(row.studentUserId))))
}

export const listScannerUsers = async ({ query = {} }) => {
  const status = query.status === undefined || query.status === "" ? "all" : query.status
  if (!LIST_FILTERS.includes(status)) return badRequest(`status must be one of ${LIST_FILTERS.join(", ")}`)
  const page = parsePositiveInt(query.page, 1)
  const limit = parsePositiveInt(query.limit, 50, MAX_PAGE_SIZE)
  const search = typeof query.search === "string" ? query.search.trim().slice(0, 60) : ""

  const filter = { onScanner: true }
  if (status === "notInHms") filter.studentUserId = null
  else if (status !== "all") filter.photoStatus = status
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i")
    filter.$or = [{ rollNumber: pattern }, { name: pattern }]
  }

  const [{ items, total }, counts, sync, profileJob] = await Promise.all([
    bioPhotoQueries.findScannerUserPage(filter, { page, limit }),
    bioPhotoQueries.countScannerUsers(),
    readState(SYNC_CONFIG_KEY),
    readState(PROFILE_JOB_CONFIG_KEY),
  ])
  return success({
    items: await withUsers(items),
    total,
    page,
    limit,
    counts,
    sync: sync ? { running: Boolean(sync.running), ok: sync.ok !== false, error: sync.error || "", lastRunAt: sync.lastRunAt || null, trigger: sync.trigger || "" } : null,
    profileJob,
    scanner: { configured: getEasyWdmsClient().configured },
  })
}

// ---------------------------------------------------------------------------
// Add by roll number
// ---------------------------------------------------------------------------

/** The HMS student for a roll number: { profile, user } or a response. */
const loadStudent = async (rawRoll) => {
  const roll = typeof rawRoll === "string" ? rawRoll.trim() : ""
  if (!roll) return { response: badRequest("Enter a roll number.") }
  if (!isScannerRollNumber(roll)) return { response: badRequest("Roll numbers can only have letters, digits, - and _.") }
  const profile = await studentProfileQueries.findByRollNumberCaseInsensitiveWithUser(roll)
  if (!profile?.userId) return { response: notFound(`No student with roll number ${roll} in HMS.`) }
  return {
    rollNumber: String(profile.rollNumber).trim(),
    user: { _id: profile.userId._id, name: profile.userId.name || "", profileImage: profile.userId.profileImage || "" },
  }
}

/** Make sure the student is an EasyWDMS employee; returns { created }. */
const ensureOnScanner = async (client, { rollNumber, user }) => {
  const existing = await client.findEmployee(rollNumber)
  if (existing) return { created: false }
  await client.createEmployee({ rollNumber, name: user.name || rollNumber })
  return { created: true }
}

export const addScannerUser = async ({ body = {}, actor }) => {
  const client = getEasyWdmsClient()
  if (!client.configured) return errorResponse("The face scanner software isn't connected yet.", 503)
  const loaded = await loadStudent(body.rollNumber)
  if (loaded.response) return loaded.response
  const { rollNumber, user } = loaded

  let added
  try {
    added = await ensureOnScanner(client, loaded)
  } catch (caught) {
    logger.warn?.(`[scanner-users] add ${rollNumber} failed: ${caught?.message || caught}`)
    return errorResponse(scannerError(caught), 502)
  }

  const existing = await bioPhotoQueries.findScannerUser(rollNumber)
  const set = { name: user.name || rollNumber, studentUserId: user._id, onScanner: true }
  if (added.created) Object.assign(set, { addedBy: actor?._id || null, addedAt: new Date() })
  if (!existing) Object.assign(set, { photoStatus: "missing", syncedAt: new Date() })
  const row = await bioPhotoOwner.upsertScannerUser(rollNumber, set)
  const [item] = await withUsers([row])
  if (!added.created) return success({ item, alreadyOnScanner: true }, 200, `${user.name || rollNumber} is already on the face scanners.`)
  return created({ item, alreadyOnScanner: false }, `${user.name || rollNumber} was added to the face scanners.`)
}

// ---------------------------------------------------------------------------
// Profile photo → bio photo
// ---------------------------------------------------------------------------

/** The student's HMS profile photo as a bio-photo upload, or { problem }. */
const readProfilePhoto = async (user) => {
  if (!user.profileImage) return { problem: "No profile photo in HMS." }
  let buffer
  try {
    ;({ buffer } = await fileAccessService.getBuffer(user.profileImage))
  } catch {
    return { problem: "The profile photo couldn't be read." }
  }
  const check = validateBioPhotoBuffer(buffer)
  if (!check.ok) return { problem: `Profile photo can't be used: ${check.message}` }
  return { buffer, contentType: check.contentType }
}

/** Refresh one user's photo and machine answers from EasyWDMS's newest rows. */
const refreshOne = async (client, rollNumber, { afterId = 0, expectedDevices = 0, waitMs = 0 } = {}) => {
  const deadline = Date.now() + waitMs
  let devices = []
  for (;;) {
    const commands = (await client.listBioPhotoCommands({ afterId, maxRows: afterId ? 200_000 : 3000 })).filter((command) => command.code === rollNumber)
    devices = latestDeviceResults(commands).get(rollNumber) || []
    const answered = devices.length >= expectedDevices && devices.every((device) => device.ok !== null)
    if (answered || Date.now() >= deadline) break
    await sleep(POLL_EVERY_MS)
  }
  const photo = (await client.recentBioPhotos(200)).find((row) => row.code === rollNumber) || null
  return { photo, devices }
}

const recordAttempt = (rollNumber, actor, outcome, message, extra = {}) =>
  bioPhotoOwner.upsertScannerUser(rollNumber, { ...extra, profileAttempt: { at: new Date(), by: actor?._id || null, outcome, message } })

/**
 * Send one student's profile photo to the scanners and wait (up to ~25 s) for
 * the machines' answers. A photo the machines already accept is kept unless
 * body.replace is true.
 */
export const tryProfilePhoto = async ({ rollNumber: rawRoll, body = {}, actor }) => {
  const client = getEasyWdmsClient()
  if (!client.configured) return errorResponse("The face scanner software isn't connected yet.", 503)
  const loaded = await loadStudent(rawRoll)
  if (loaded.response) return loaded.response
  const { rollNumber, user } = loaded
  const base = { name: user.name || rollNumber, studentUserId: user._id, onScanner: true }

  const current = await bioPhotoQueries.findScannerUser(rollNumber)
  if (current?.photoStatus === "valid" && body.replace !== true) {
    return conflict("This student already has a working scanner photo.")
  }

  const upload = await readProfilePhoto(user)
  if (upload.problem) {
    const row = await recordAttempt(rollNumber, actor, "unusable", upload.problem, current ? {} : { ...base, onScanner: false, photoStatus: "missing" })
    const [item] = await withUsers([row])
    return success({ item, outcome: "unusable" }, 200, upload.problem)
  }

  let refreshed
  try {
    const added = await ensureOnScanner(client, loaded)
    if (added.created) Object.assign(base, { addedBy: actor?._id || null, addedAt: new Date() })
    const setup = await client.getSetup()
    const afterId = await client.latestCommandId()
    await client.importBioPhoto({ rollNumber, buffer: upload.buffer, contentType: upload.contentType, overwrite: true })
    refreshed = await refreshOne(client, rollNumber, { afterId, expectedDevices: setup.terminals.length, waitMs: WAIT_FOR_MACHINES_MS })
  } catch (caught) {
    const message = scannerError(caught)
    logger.warn?.(`[scanner-users] profile photo for ${rollNumber} failed: ${caught?.message || caught}`)
    await recordAttempt(rollNumber, actor, "failed", message, base)
    return errorResponse(message, 502)
  }

  const { photo, devices } = refreshed
  const photoStatus = derivePhotoStatus(photo, devices)
  const rejected = devices.filter((device) => device.ok === false)
  const message =
    photoStatus === "valid"
      ? "Accepted by every machine."
      : rejected.length
        ? `Rejected by ${rejected.map((device) => device.alias).join(", ")}: ${rejected[0].message || "error"}`
        : "Sent. Some machines haven't answered yet; the nightly sync will check again."
  const row = await recordAttempt(rollNumber, actor, rejected.length ? "failed" : "sent", message, {
    ...base,
    bioPhoto: photoFields(photo),
    devices,
    devicesChecked: devices.length > 0,
    photoStatus,
    syncedAt: new Date(),
  })
  const [item] = await withUsers([row])
  return success({ item, outcome: photoStatus }, 200, message)
}

// ---------------------------------------------------------------------------
// Bulk: profile photos for everyone without a working photo
// ---------------------------------------------------------------------------

const runProfilePhotoJob = async (actor) => {
  const client = getEasyWdmsClient()
  const candidates = await bioPhotoQueries.findProfilePhotoCandidates()
  const state = { running: true, startedAt: new Date(), finishedAt: null, total: candidates.length, done: 0, sent: 0, unusable: 0, failed: 0, error: "" }
  await writeState(PROFILE_JOB_CONFIG_KEY, state)

  for (const candidate of candidates) {
    const rollNumber = candidate.rollNumber
    try {
      const users = await userQueries.findUsers({ _id: candidate.studentUserId }, { select: "name profileImage", lean: true })
      const upload = users[0] ? await readProfilePhoto(users[0]) : { problem: "Student not found in HMS." }
      if (upload.problem) {
        await recordAttempt(rollNumber, actor, "unusable", upload.problem)
        state.unusable++
      } else {
        await client.importBioPhoto({ rollNumber, buffer: upload.buffer, contentType: upload.contentType, overwrite: true })
        await recordAttempt(rollNumber, actor, "sent", "Sent. The machines' answers show after the next sync.", { photoStatus: "pending" })
        state.sent++
      }
    } catch (caught) {
      await recordAttempt(rollNumber, actor, "failed", scannerError(caught)).catch(() => {})
      state.failed++
      if (caught instanceof EasyWdmsError && ["login", "network", "config"].includes(caught.kind)) {
        state.error = caught.message
        break
      }
    }
    state.done++
    if (state.done % 10 === 0) await writeState(PROFILE_JOB_CONFIG_KEY, state)
  }

  Object.assign(state, { running: false, finishedAt: new Date() })
  await writeState(PROFILE_JOB_CONFIG_KEY, state)
  logger.info?.(`[scanner-users] profile photos: ${state.sent} sent, ${state.unusable} unusable, ${state.failed} failed of ${state.total}`)
  // Give the machines a moment, then pick up their answers.
  if (state.sent) {
    await sleep(60_000)
    await syncScannerUsers({ trigger: "profile-photos" })
  }
  return state
}

/** Start the bulk run in the background; 409 while one runs. */
export const startProfilePhotoJob = async ({ actor }) => {
  if (!getEasyWdmsClient().configured) return errorResponse("The face scanner software isn't connected yet.", 503)
  const candidates = await bioPhotoQueries.findProfilePhotoCandidates()
  if (!candidates.length) return badRequest("Nobody needs a profile photo tried: everyone in HMS without a working photo has been tried already.")
  const current = await readState(PROFILE_JOB_CONFIG_KEY)
  if (current?.running && Date.now() - new Date(current.startedAt).getTime() < 2 * 60 * 60 * 1000) return conflict("Profile photos are already being sent.")

  withLock(PROFILE_JOB_LOCK, 2 * 60 * 60, () => runProfilePhotoJob(actor)).catch((caught) => {
    logger.warn?.(`[scanner-users] profile photo run failed: ${caught?.message || caught}`)
    writeState(PROFILE_JOB_CONFIG_KEY, { running: false, finishedAt: new Date(), error: scannerError(caught) }).catch(() => {})
  })
  return success({ started: true, total: candidates.length }, 202, `Sending profile photos for ${candidates.length} students`)
}

// ---------------------------------------------------------------------------
// Photo + approval hook
// ---------------------------------------------------------------------------

/** The scanner photo bytes for display, or null. */
export const getScannerPhoto = async ({ rollNumber }) => {
  const client = getEasyWdmsClient()
  if (!client.configured || !isScannerRollNumber(rollNumber)) return null
  const row = await bioPhotoQueries.findScannerUser(String(rollNumber))
  if (!row?.bioPhoto?.path) return null
  try {
    return await client.fetchBioPhotoFile(row.bioPhoto.path)
  } catch {
    return null
  }
}

/**
 * After a student's photo request is approved: mark the copy pending now and
 * pick up the machines' answers a little later. Never throws.
 */
export const noteBioPhotoPushed = async ({ rollNumber, studentUserId, name }) => {
  try {
    await bioPhotoOwner.upsertScannerUser(rollNumber, { onScanner: true, studentUserId: studentUserId || null, ...(name ? { name } : {}), photoStatus: "pending", devices: [], devicesChecked: false })
  } catch (caught) {
    logger.warn?.(`[scanner-users] couldn't note push for ${rollNumber}: ${caught?.message || caught}`)
    return
  }
  const timer = setTimeout(async () => {
    try {
      const { photo, devices } = await refreshOne(getEasyWdmsClient(), rollNumber)
      if (!photo) return
      await bioPhotoOwner.upsertScannerUser(rollNumber, { bioPhoto: photoFields(photo), devices, devicesChecked: devices.length > 0, photoStatus: derivePhotoStatus(photo, devices), syncedAt: new Date() })
    } catch (caught) {
      logger.warn?.(`[scanner-users] refresh after approval failed for ${rollNumber}: ${caught?.message || caught}`)
    }
  }, REFRESH_AFTER_APPROVAL_MS)
  timer.unref?.()
}
