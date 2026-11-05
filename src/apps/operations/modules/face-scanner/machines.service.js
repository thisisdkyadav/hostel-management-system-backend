/**
 * Face machines (direct iclock connection) — what the Face Scanners page shows
 * and changes. Everything here comes from what each machine reports about
 * itself; an admin only names it, links it to a FaceScanner (what it's for)
 * and switches it between shadow and live.
 */
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { iclockOwner } from "../../../../services/iclock/iclockOwner.service.js"
import { iclockQueries } from "../../../../services/iclock/iclockQueries.service.js"
import { scannerQueries } from "../../../../services/scanner/scannerQueries.service.js"
import { clearIclockCaches } from "../../../../services/iclock/iclock.service.js"
import { getFaceSummary } from "../../../../services/dining/scanner-faces.service.js"
import { ICLOCK_DEVICE_MODES } from "../../../../models/iclock/IclockDevice.model.js"
import {
  previewRoster,
  pushPerson,
  removePerson,
  requestMachineUsers,
  runRosterSync,
  seedRosterFromEasyWdms,
} from "../../../../services/iclock/roster.service.js"

const ONLINE_WITHIN_MS = 60 * 1000

const num = (value) => {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : null
}

/** "0:88:0:0:0:0:0:0:0:4035:0" → the face slot (index 9 on these machines). */
const faceSlot = (value) => num(String(value || "").split(":")[9])

const median = (values) => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const startOfToday = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

const scannerSummary = (scanner) =>
  scanner
    ? {
        id: String(scanner._id),
        name: scanner.name,
        type: scanner.type,
        direction: scanner.direction,
        isActive: scanner.isActive !== false,
        hostel: scanner.hostelId?.name || "",
        caterer: scanner.catererId?.name || "",
      }
    : null

const toMachine = (device, { punchesToday, commands, clockOffsetMs, scanner }, now) => {
  const options = device.info?.options || {}
  return {
    sn: device.sn,
    alias: device.alias || "",
    mode: device.mode,
    online: Boolean(device.lastSeenAt && now - new Date(device.lastSeenAt).getTime() < ONLINE_WITHIN_MS),
    lastSeenAt: device.lastSeenAt,
    lastPunchAt: device.lastPunchAt,
    lastHandshakeAt: device.lastHandshakeAt,
    firstSeenAt: device.firstSeenAt,
    model: options.DeviceName || "",
    firmware: options.FWVersion || device.info?.poll?.firmware || "",
    pushVersion: options.PushVersion || device.pushVersion || "",
    platform: options.Platform || "",
    mac: options.MAC || "",
    ip: options.IPAddress || device.info?.poll?.ip || "",
    path: device.forwardedFor || device.ip || "",
    users: num(options.UserCount) ?? device.info?.poll?.users ?? null,
    faces: num(options.FaceCount) ?? faceSlot(options.MultiBioDataCount),
    facePhotos: faceSlot(options.MultiBioPhotoCount),
    maxFaces: num(options.MaxFaceCount) ?? faceSlot(options.MaxMultiBioDataCount),
    storedPunches: num(options.TransactionCount),
    punchesToday,
    commands,
    clockOffsetSeconds: clockOffsetMs === null ? null : Math.round(clockOffsetMs / 1000),
    scanner: scannerSummary(scanner),
    sync: {
      enabled: Boolean(device.sync?.enabled),
      lastRunAt: device.sync?.lastRunAt || null,
      lastResult: device.sync?.lastResult || null,
    },
  }
}

export const listMachines = async () => {
  const now = Date.now()
  const [devices, stats, scanners, faces] = await Promise.all([
    iclockQueries.listDevices(),
    iclockQueries.machineStats(startOfToday()),
    scannerQueries.listScanners({}, { hidePasswordHash: true }),
    getFaceSummary(),
  ])
  const scannerById = new Map(scanners.map((s) => [String(s._id), s]))
  const punchesBySn = new Map(stats.punches.map((r) => [r._id, r.n]))
  const offsetBySn = new Map(
    stats.recent.map((r) => [r._id, median(r.diffs.filter((d) => Math.abs(d) < 3600e3))]),
  )
  const commandsBySn = new Map()
  for (const row of stats.commands) {
    const entry = commandsBySn.get(row._id.sn) || { queued: 0, sent: 0, failedToday: 0 }
    if (row._id.status === "queued") entry.queued = row.n
    else if (row._id.status === "sent") entry.sent = row.n
    else entry.failedToday = row.n
    commandsBySn.set(row._id.sn, entry)
  }

  const machines = devices.map((device) =>
    toMachine(
      device,
      {
        punchesToday: punchesBySn.get(device.sn) || 0,
        commands: commandsBySn.get(device.sn) || { queued: 0, sent: 0, failedToday: 0 },
        clockOffsetMs: offsetBySn.get(device.sn) ?? null,
        scanner: device.faceScannerId ? scannerById.get(String(device.faceScannerId)) : null,
      },
      now,
    ),
  )
  return success({ machines, faces })
}

const SN_PATTERN = /^[A-Za-z0-9]{6,32}$/

/** Add a machine by the serial number on its label (Menu › System Info). Until then HMS ignores it. */
export const createMachine = async (body = {}) => {
  const sn = String(body.sn || "").trim().toUpperCase()
  if (!SN_PATTERN.test(sn)) return badRequest("Enter the machine's serial number: 6–32 letters and digits")
  if (await iclockQueries.findDevice(sn)) return badRequest("That machine is already added")
  await iclockOwner.createDevice({ sn, alias: String(body.alias || "").trim().slice(0, 60) })
  clearIclockCaches()
  return listMachines()
}

export const updateMachine = async (sn, body = {}) => {
  const device = await iclockQueries.findDevice(sn)
  if (!device) return notFound("Machine not found")

  const set = {}
  if (body.alias !== undefined) set.alias = String(body.alias || "").trim().slice(0, 60)
  if (body.mode !== undefined) {
    if (!ICLOCK_DEVICE_MODES.includes(body.mode)) return badRequest("Mode must be shadow or live")
    set.mode = body.mode
  }
  if (body.faceScannerId !== undefined) {
    if (body.faceScannerId) {
      const scanner = await scannerQueries.findScannerByIdPopulatedLean(body.faceScannerId).catch(() => null)
      if (!scanner) return badRequest("That scanner doesn't exist")
      set.faceScannerId = scanner._id
    } else set.faceScannerId = null
  }
  if (body.sync !== undefined) set["sync.enabled"] = Boolean(body.sync)
  const nextMode = set.mode ?? device.mode
  const nextScanner = set.faceScannerId !== undefined ? set.faceScannerId : device.faceScannerId
  if (nextMode === "live" && !nextScanner) return badRequest("Link the machine to a scanner before making it live")
  if (!Object.keys(set).length) return badRequest("Nothing to change")

  await iclockOwner.updateDevice(sn, set)
  if (set["sync.enabled"] && !device.sync?.seededAt) await seedRosterFromEasyWdms(sn)
  clearIclockCaches()
  return listMachines()
}

export const getMachineActivity = async (sn) => {
  const device = await iclockQueries.findDevice(sn)
  if (!device) return notFound("Machine not found")
  const [punches, commands, log] = await Promise.all([
    iclockQueries.listPunches({ sn, limit: 50 }),
    iclockQueries.listCommands({ sn, limit: 50 }),
    iclockQueries.listRequestLogs({ sn, limit: 50 }),
  ])
  return success({
    punches: punches.map((p) => ({ pin: p.pin, localTime: p.localTime, receivedAt: p.receivedAt, verify: p.verify, outcome: p.outcome })),
    commands: commands.map((c) => ({
      commandId: c.commandId, command: c.command.slice(0, 200), status: c.status, returnCode: c.returnCode, createdAt: c.createdAt, doneAt: c.doneAt,
    })),
    log: log.map((l) => ({ at: l.at, method: l.method, path: l.path, query: l.query, status: l.status, ms: l.ms, bodyBytes: l.bodyBytes, response: l.response.slice(0, 200) })),
  })
}

// ---- People on a machine (roster sync) --------------------------------------

const withDevice = async (sn, work) => {
  const device = await iclockQueries.findDevice(sn)
  if (!device) return notFound("Machine not found")
  return work(device)
}

const rosterView = async (sn) => {
  const [preview, failures, device] = await Promise.all([
    previewRoster(sn),
    iclockQueries.listRosterFailures(sn, 30),
    iclockQueries.findDevice(sn),
  ])
  return {
    sync: { enabled: Boolean(device.sync?.enabled), seededAt: device.sync?.seededAt || null, lastRunAt: device.sync?.lastRunAt || null, lastResult: device.sync?.lastResult || null },
    preview,
    failures: failures.map((f) => ({ pin: f.pin, name: f.name, op: f.lastResult?.op || "", code: f.lastResult?.code ?? null, at: f.lastResult?.at || null })),
  }
}

export const getMachineRoster = (sn) => withDevice(sn, async () => success(await rosterView(sn)))

export const syncMachineRoster = (sn, body = {}, actor) =>
  withDevice(sn, async () => {
    const result = await runRosterSync(sn, { allowRemovals: body.allowRemovals === true, createdBy: actor?._id || null })
    if (result.running) return badRequest("A sync is already running for this machine")
    return success({ result, ...(await rosterView(sn)) })
  })

export const pushMachinePerson = (sn, body = {}, actor) =>
  withDevice(sn, async () => {
    const roll = String(body.rollNumber ?? "").trim()
    if (!roll) return badRequest("Enter a roll number")
    const result = await pushPerson(sn, roll, actor?._id || null)
    if (!result.ok) return badRequest(result.message)
    return success(result, 202, `Sent ${result.pin} to the machine`)
  })

export const removeMachinePerson = (sn, rollNumber, actor) =>
  withDevice(sn, async () => {
    const result = await removePerson(sn, rollNumber, actor?._id || null)
    if (!result.ok) return badRequest(result.message)
    return success(result, 202, `Removing ${result.pin} from the machine`)
  })

export const readMachinePeople = (sn, actor) =>
  withDevice(sn, async () => {
    await requestMachineUsers(sn, actor?._id || null)
    return success({ queued: true }, 202, "Asked the machine for its people list")
  })


