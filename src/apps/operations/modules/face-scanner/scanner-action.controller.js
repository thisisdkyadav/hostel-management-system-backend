import * as scannerActionService from "./scanner-action.service.js"
import { asyncHandler } from "../../../../utils/index.js"

/**
 * Scanner Action Controller
 * Handles automated actions from scanner devices.
 *
 * Two request formats are accepted on POST /scan (the format is auto-detected):
 *
 * 1. Native format (single object) — reply { "isSuccess": "Y", "outputMessage": ... }
 *    {
 *      "deviceID": "K70798176", "deviceSerialno": "K70798176",
 *      "employeeID": "22BCS001",  // Roll number
 *      "date": "2025-08-04", "time": "09:32:00",
 *      "modeofPunch": "Face", "modeofAttn": "IN", "ip": "192.168.1.244"
 *    }
 *
 * 2. Easy TimePro / ZKTeco push (JSON array of punches) — reply
 *    { "status": "success", "code": 200, "message": "Attendance data processed successfully" }
 *    [ { "EMP_CODE": "22BCS001", "PUNCH_DATETIME": "2025-08-04 09:32:00",
 *        "PUNCH_STATE": "0", "VERIFY_TYPE": "15", "TERMINAL_SN": "K70798176", ... } ]
 *
 * Both auth schemes (HTTP Basic Auth and the legacy custom header) are handled
 * upstream by authenticateScanner.
 */

const pad2 = (value) => String(value).padStart(2, "0")

/** A body is Easy TimePro when it's an array, or an object carrying its keys. */
const isEasyTimeProPayload = (body) => {
  if (Array.isArray(body)) return true
  if (!body || typeof body !== "object") return false
  return "EMP_CODE" in body || "PUNCH_DATETIME" in body || "TERMINAL_SN" in body
}

/** PUNCH_STATE → IN/OUT (undefined falls back to the scanner's configured direction). */
const mapPunchState = (state) => {
  const value = String(state ?? "").trim().toLowerCase()
  if (["0", "in", "i", "checkin", "check in", "check-in"].includes(value)) return "IN"
  if (["1", "out", "o", "checkout", "check out", "check-out"].includes(value)) return "OUT"
  return undefined
}

/** VERIFY_TYPE → friendly punch mode (best-effort; defaults to Face). */
const VERIFY_TYPE_LABELS = { 0: "Password", 1: "Fingerprint", 3: "Password", 4: "Card", 15: "Face" }
const mapVerifyType = (verifyType) => {
  const key = String(verifyType ?? "").trim()
  if (VERIFY_TYPE_LABELS[key]) return VERIFY_TYPE_LABELS[key]
  const lower = key.toLowerCase()
  if (lower.includes("face")) return "Face"
  if (lower.includes("finger")) return "Fingerprint"
  if (lower.includes("card")) return "Card"
  return "Face"
}

/**
 * Parse "YYYY-MM-DD HH:mm:ss" / ISO PUNCH_DATETIME (with PUNCH_TIME fallback)
 * into { date, time, dateTime }. Treated as server-local time, matching the
 * native single-object path. Returns {} when unparseable.
 */
const parsePunchDateTime = (punchDateTime, punchTime) => {
  const raw = String(punchDateTime ?? "").trim()
  let datePart = ""
  let timePart = ""

  if (raw) {
    const normalized = raw.replace("T", " ").replace(/\//g, "-")
    const segments = normalized.split(/\s+/)
    datePart = segments[0] || ""
    timePart = (segments[1] || "").trim()
  }
  if (!timePart && punchTime) timePart = String(punchTime).trim()

  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(datePart)
  if (!dateMatch) return {}
  const date = `${dateMatch[1]}-${pad2(dateMatch[2])}-${pad2(dateMatch[3])}`

  const timeMatch = /^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(timePart || "00:00:00")
  if (!timeMatch) return {}
  const time = `${pad2(timeMatch[1])}:${pad2(timeMatch[2])}:${pad2(timeMatch[3] || "00")}`

  const dateTime = new Date(`${date}T${time}`)
  if (Number.isNaN(dateTime.getTime())) return {}
  return { date, time, dateTime }
}

/** Map one Easy TimePro record into the internal scanData shape, or null if invalid. */
const mapEasyTimeProRecord = (record, scanner) => {
  if (!record || typeof record !== "object") return null

  const employeeID = String(record.EMP_CODE ?? "").trim()
  if (!employeeID) return null

  const { date, time, dateTime } = parsePunchDateTime(record.PUNCH_DATETIME, record.PUNCH_TIME)
  if (!dateTime) return null

  const terminalSn = String(record.TERMINAL_SN ?? record.TERMINAL_ALIAS ?? "").trim()
  const modeofAttn = mapPunchState(record.PUNCH_STATE)

  let direction = scanner.direction
  if (modeofAttn === "IN") direction = "in"
  else if (modeofAttn === "OUT") direction = "out"

  return {
    deviceID: terminalSn || scanner.username || "unknown",
    deviceSerialno: terminalSn,
    employeeID,
    date,
    time,
    dateTime,
    modeofPunch: mapVerifyType(record.VERIFY_TYPE),
    modeofAttn,
    direction,
  }
}

/**
 * Handle an Easy TimePro batch push. Each punch is processed independently and
 * the whole batch is acknowledged with HTTP 200 so the device does not resend —
 * business-level rejects (unknown student, wrong caterer, duplicate, …) are
 * recorded/logged, not retried. Only auth and malformed payloads fail upstream.
 */
const processEasyTimeProBatch = async (req, res, scanner) => {
  const records = Array.isArray(req.body) ? req.body : [req.body]

  for (const record of records) {
    const scanData = mapEasyTimeProRecord(record, scanner)
    if (!scanData) {
      console.warn("Skipping invalid Easy TimePro record:", JSON.stringify(record))
      continue
    }

    try {
      if (scanner.type === "hostel-gate") {
        await scannerActionService.processHostelGateEntry(scanner, scanData)
      } else if (scanner.type === "dining-meal") {
        await scannerActionService.processDiningMealVerification(scanner, scanData)
      } else {
        console.warn(`Unknown scanner type for Easy TimePro batch: ${scanner.type}`)
      }
    } catch (error) {
      console.error("Error processing Easy TimePro record:", error)
    }
  }

  return res.status(200).json({
    status: "success",
    code: 200,
    message: "Attendance data processed successfully",
  })
}

/**
 * Process device data - creates entry using device format
 * POST /api/v1/face-scanner/scan
 */
export const processScan = asyncHandler(async (req, res) => {
  const scanner = req.scanner

  // Easy TimePro / ZKTeco push (array or Easy TimePro-keyed object)
  if (isEasyTimeProPayload(req.body)) {
    return processEasyTimeProBatch(req, res, scanner)
  }

  const { deviceID, deviceSerialno, employeeID, date, modeofPunch, modeofAttn, time, ip } = req.body

  // Validate required fields
  if (!deviceID) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: deviceID is required",
    })
  }

  if (!employeeID) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: employeeID is required",
    })
  }

  if (!date) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: date is required",
    })
  }

  if (!time) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: time is required",
    })
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: date must be YYYY-MM-DD format",
    })
  }

  // Validate time format (HH:mm or HH:mm:ss)
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    return res.status(400).json({
      isSuccess: "N",
      outputMessage: "Invalid payload: time must be HH:mm or HH:mm:ss format",
    })
  }

  // Determine direction from modeofAttn
  let direction = scanner.direction // Use scanner's configured direction as default
  if (modeofAttn) {
    const mode = modeofAttn.toUpperCase()
    if (mode === "IN") {
      direction = "in"
    } else if (mode === "OUT") {
      direction = "out"
    }
    // AUTO uses scanner's configured direction
  }

  // Build datetime from date and time
  const dateTimeStr = `${date}T${time}`
  const dateTime = new Date(dateTimeStr)

  // Prepare scan data
  const scanData = {
    deviceID,
    deviceSerialno,
    employeeID, // This is the roll number
    date,
    time,
    dateTime,
    modeofPunch,
    modeofAttn,
    ip,
    direction,
  }

  // Route to appropriate handler based on scanner type
  switch (scanner.type) {
    case "hostel-gate":
      const result = await scannerActionService.processHostelGateEntry(scanner, scanData)
      
      if (result.success) {
        return res.status(200).json({
          isSuccess: "Y",
          outputMessage: "Added Successfully",
        })
      } else {
        return res.status(result.status || 400).json({
          isSuccess: "N",
          outputMessage: result.message,
        })
      }

    case "dining-meal":
      const diningResult = await scannerActionService.processDiningMealVerification(scanner, scanData)

      if (diningResult.success) {
        return res.status(200).json({
          isSuccess: "Y",
          outputMessage: diningResult.message || "Added Successfully",
        })
      }

      return res.status(diningResult.status || 400).json({
        isSuccess: "N",
        outputMessage: diningResult.message,
      })

    default:
      return res.status(400).json({
        isSuccess: "N",
        outputMessage: `Unknown scanner type: ${scanner.type}`,
      })
  }
})

/**
 * Health check for scanner
 * GET /api/face-scanner/ping
 */
export const ping = asyncHandler(async (req, res) => {
  res.status(200).json({
    isSuccess: "Y",
    outputMessage: "Scanner connected",
    scanner: {
      name: req.scanner.name,
      type: req.scanner.type,
      direction: req.scanner.direction,
    },
    timestamp: new Date(),
  })
})
