import * as scannerActionService from "../services/scannerAction.service.js"
import { asyncHandler } from "../utils/index.js"

/**
 * Scanner Action Controller
 * Handles automated actions from scanner devices
 * All routes use scanner authentication (Basic Auth)
 * 
 * Device Request Format:
 * {
 *   "deviceID": "K70798176",
 *   "deviceSerialno": "K70798176",
 *   "employeeID": "22BCS001",  // Roll number
 *   "date": "2025-08-04",       // YYYY-MM-DD
 *   "modeofPunch": "Face",      // Face | Fingerprint | Card
 *   "modeofAttn": "IN",         // IN | OUT | AUTO
 *   "time": "09:32:00",         // HH:mm:ss
 *   "ip": "192.168.1.244"
 * }
 * 
 * Response Format:
 * { "isSuccess": "Y", "outputMessage": "Added Successfully" }
 */

/**
 * Process device data - creates entry using device format
 * POST /api/face-scanner/scan
 */
export const processScan = asyncHandler(async (req, res) => {
  const scanner = req.scanner
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
