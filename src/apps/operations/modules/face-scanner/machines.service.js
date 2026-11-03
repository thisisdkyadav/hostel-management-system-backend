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
import { getFaceSummary, startFaceImport } from "../../../../services/dining/scanner-faces.service.js"
import { ICLOCK_DEVICE_MODES } from "../../../../models/iclock/IclockDevice.model.js"

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
  const nextMode = set.mode ?? device.mode
  const nextScanner = set.faceScannerId !== undefined ? set.faceScannerId : device.faceScannerId
  if (nextMode === "live" && !nextScanner) return badRequest("Link the machine to a scanner before making it live")
  if (!Object.keys(set).length) return badRequest("Nothing to change")

  await iclockOwner.updateDevice(sn, set)
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

export const importFaces = async () => {
  startFaceImport({ trigger: "manual" })
  return success({ started: true }, 202, "Copying face photos from EasyWDMS")
}
