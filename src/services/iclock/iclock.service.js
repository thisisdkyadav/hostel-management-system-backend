/**
 * iclock service — HMS's side of the ZKTeco PUSH protocol.
 *
 * `handleIclockRequest` takes one raw machine request and returns the exact
 * text answer. It never throws for bad machine input: a machine that gets a
 * non-200 just retries the same upload forever, so anything we can't use is
 * stored/logged and acknowledged.
 *
 * Punches from a machine in `live` mode go straight to the dining/gate
 * handlers in-process (no HTTP hop). `shadow` machines are recorded only.
 */
import { iclockOwner } from "./iclockOwner.service.js"
import { iclockQueries } from "./iclockQueries.service.js"
import {
  formatCommands,
  handshakeResponse,
  mapPunchState,
  mapVerifyType,
  parseAttlog,
  parseDeviceCmdResults,
  parseInfoParam,
  parseOptions,
  parseRecords,
} from "./protocol.js"
import { scannerQueries } from "../scanner/scannerQueries.service.js"
import { readFaceForMachine } from "../dining/scanner-faces.service.js"
import * as scannerActionService from "../../apps/operations/modules/face-scanner/scanner-action.service.js"

/** Punches further than this from "now" (by machine clock) are stored but never turned into records. */
export const LIVE_PUNCH_MAX_AGE_MS = 30 * 60 * 1000
const LOG_BODY_LIMIT = 4096
const SCANNER_CACHE_MS = 10 * 1000

const scannerCache = new Map() // faceScannerId -> { at, scanner }

const loadScanner = async (faceScannerId) => {
  if (!faceScannerId) return null
  const key = String(faceScannerId)
  const hit = scannerCache.get(key)
  if (hit && Date.now() - hit.at < SCANNER_CACHE_MS) return hit.scanner
  const scanner = await scannerQueries.findScannerByIdPopulatedLean(faceScannerId)
  scannerCache.set(key, { at: Date.now(), scanner })
  return scanner
}

export const clearIclockCaches = () => scannerCache.clear()

const text = (body) => (Buffer.isBuffer(body) ? body.toString("utf8") : String(body ?? ""))

// ---- Punches ---------------------------------------------------------------

const processPunch = async ({ device, scanner, punch, now }) => {
  if (device.mode !== "live") return { processed: false, reason: "shadow" }
  if (!scanner) return { processed: false, reason: "unlinked" }
  if (!scanner.isActive) return { processed: false, reason: "scanner-inactive" }
  const age = now - punch.dateTime.getTime()
  if (age > LIVE_PUNCH_MAX_AGE_MS) return { processed: false, reason: "too-old" }
  if (-age > LIVE_PUNCH_MAX_AGE_MS) return { processed: false, reason: "clock-ahead" }

  const modeofAttn = mapPunchState(punch.status)
  const direction = modeofAttn === "IN" ? "in" : modeofAttn === "OUT" ? "out" : scanner.direction
  const scanData = {
    deviceID: device.sn,
    deviceSerialno: device.sn,
    employeeID: punch.pin,
    date: punch.date,
    time: punch.time,
    dateTime: punch.dateTime,
    modeofPunch: mapVerifyType(punch.verify),
    modeofAttn,
    direction,
  }

  const started = Date.now()
  let result
  if (scanner.type === "dining-meal") result = await scannerActionService.processDiningMealVerification(scanner, scanData)
  else if (scanner.type === "hostel-gate") result = await scannerActionService.processHostelGateEntry(scanner, scanData)
  else return { processed: false, reason: "unknown-scanner-type" }

  return {
    processed: true,
    success: Boolean(result?.success),
    reason: "",
    message: String(result?.message ?? ""),
    ms: Date.now() - started,
  }
}

const handleAttlog = async (device, body, now) => {
  const { punches, rejected } = parseAttlog(body)
  if (rejected.length) console.warn(`[iclock] ${device.sn}: ${rejected.length} unparsable ATTLOG line(s)`)

  const inserted = await iclockOwner.insertPunches(
    punches.map((p) => ({
      sn: device.sn,
      pin: p.pin,
      localTime: p.localTime,
      punchedAt: p.dateTime,
      status: p.status,
      verify: p.verify,
      workCode: p.workCode,
      raw: p.raw,
      receivedAt: new Date(now),
    })),
  )

  if (inserted.length) {
    const scanner = device.mode === "live" ? await loadScanner(device.faceScannerId) : null
    const byKey = new Map(punches.map((p) => [`${p.pin}|${p.localTime}`, p]))
    for (const doc of inserted) {
      const punch = byKey.get(`${doc.pin}|${doc.localTime}`)
      let outcome
      try {
        outcome = await processPunch({ device, scanner, punch, now })
      } catch (error) {
        console.error(`[iclock] ${device.sn}: punch ${doc.pin} ${doc.localTime} failed:`, error?.message || error)
        outcome = { processed: true, success: false, reason: "error", message: String(error?.message || error) }
      }
      await iclockOwner.setPunchOutcome(doc._id, outcome)
    }
    const latest = punches.reduce((max, p) => (p.dateTime > max ? p.dateTime : max), punches[0].dateTime)
    await iclockOwner.updateDevice(device.sn, { lastPunchAt: latest })
  }

  return `OK:${punches.length}\n`
}

// ---- Request dispatch ------------------------------------------------------

const deviceSetFromRequest = ({ query, ip, headers }) => {
  const set = {}
  if (ip) set.ip = ip
  const xff = headers?.["x-forwarded-for"]
  if (xff) set.forwardedFor = String(xff)
  if (query.pushver) set.pushVersion = String(query.pushver)
  const info = parseInfoParam(query.INFO)
  if (info) set["info.poll"] = info
  return set
}

const dispatch = async ({ method, route, query, body, device, now }) => {
  const sn = device.sn

  if (route === "cdata") {
    if (method === "GET") {
      await iclockOwner.updateDevice(sn, { lastHandshakeAt: new Date(now) })
      return handshakeResponse({ sn })
    }
    const table = String(query.table || "").toUpperCase()
    if (query.Stamp && table) await iclockOwner.setStamp(sn, table, query.Stamp)
    if (table === "ATTLOG") return handleAttlog(device, text(body), now)
    if (table === "OPTIONS") {
      await iclockOwner.updateDevice(sn, { "info.options": parseOptions(text(body)), "info.optionsAt": new Date(now) })
      return "OK\n"
    }
    // ERRORLOG: EasyWDMS stores nothing and answers OK:0 (captured); we do the same.
    if (table === "ERRORLOG") return "OK:0\n"
    // OPERLOG / BIODATA / ATTPHOTO / USERINFO …: acknowledged; the raw log keeps a copy.
    const records = table === "ATTPHOTO" ? [] : parseRecords(text(body))
    return `OK:${records.length || 1}\n`
  }

  if (route === "getrequest") {
    const queued = await iclockQueries.findQueuedCommands(sn)
    await iclockOwner.markCommandsSent(sn, queued.map((c) => c.commandId))
    return formatCommands(queued)
  }

  if (route === "devicecmd") {
    for (const result of parseDeviceCmdResults(text(body))) await iclockOwner.completeCommand(sn, result)
    return "OK"
  }

  // ping, and anything newer firmwares add — acknowledge, keep a log.
  return "OK"
}

/**
 * @param {{ method: string, path: string, query: object, body: Buffer|string, headers?: object, ip?: string }} req
 * @returns {Promise<{ status: number, body: string }>}
 */
export const handleIclockRequest = async ({ method, path, query = {}, body, headers = {}, ip = "" }) => {
  const started = Date.now()
  const route = String(path || "").replace(/^\/+|\/+$/g, "").replace(/^iclock\//, "").split("/")[0]
  const sn = String(query.SN ?? query.sn ?? "").trim()
  const bodyText = text(body)

  if (!sn) return { status: 400, body: "Missing SN" }

  let status = 200
  let answer
  try {
    const device = await iclockOwner.touchDevice(sn, deviceSetFromRequest({ query, ip, headers }))
    answer = await dispatch({ method, route, query, body: bodyText, device, now: started })
  } catch (error) {
    console.error(`[iclock] ${sn} ${method} ${route} failed:`, error?.message || error)
    status = 500
    answer = "ERROR"
  }

  // Keep the log useful, not huge: idle polls ("OK" answers) aren't stored.
  const idlePoll = (route === "getrequest" || route === "ping") && answer === "OK" && !query.INFO
  if (!idlePoll) {
    iclockOwner
      .logRequest({
        sn,
        method,
        path: route,
        query: new URLSearchParams(query).toString(),
        bodyBytes: Buffer.byteLength(bodyText),
        body: bodyText.slice(0, LOG_BODY_LIMIT),
        status,
        response: String(answer).slice(0, LOG_BODY_LIMIT),
        ms: Date.now() - started,
        at: new Date(started),
      })
      .catch((error) => console.error("[iclock] request log failed:", error?.message || error))
  }

  return { status, body: answer }
}

/**
 * GET /iclock/file/biophoto/<token>/<roll>.jpg — a face the machine was told to
 * download by a BIOPHOTO command. Returns { status, body: Buffer|string, contentType }.
 */
export const handleIclockFileRequest = async ({ path, ip = "" }) => {
  const started = Date.now()
  const match = /^\/iclock\/file\/biophoto\/([0-9a-f]{32})\/([A-Za-z0-9_-]+)\.jpe?g$/i.exec(String(path || ""))
  let result = { status: 404, body: "Not found", contentType: "text/plain" }
  if (match) {
    try {
      const face = await readFaceForMachine({ token: match[1].toLowerCase(), rollNumber: match[2] })
      if (face) result = { status: 200, body: face.buffer, contentType: face.contentType }
    } catch (error) {
      console.error("[iclock] face file failed:", error?.message || error)
      result = { status: 500, body: "ERROR", contentType: "text/plain" }
    }
  }
  iclockOwner
    .logRequest({
      sn: "",
      method: "GET",
      path: "file",
      query: String(path || "").slice(0, 300),
      status: result.status,
      response: result.status === 200 ? `${result.body.length} bytes` : String(result.body),
      ms: Date.now() - started,
      at: new Date(started),
      body: ip ? `ip=${ip}` : "",
    })
    .catch(() => {})
  return result
}

export default { handleIclockRequest, handleIclockFileRequest }
