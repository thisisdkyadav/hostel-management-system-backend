/**
 * Face Scanner Authentication Middleware
 * Handles authentication for face scanner devices
 */
import { scannerOwner } from "../services/scanner/scannerOwner.service.js"
import { scannerQueries } from "../services/scanner/scannerQueries.service.js"
import bcrypt from "bcrypt"
import crypto from "crypto"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { getIO } from "../loaders/socket.loader.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logDir = path.join(__dirname, "../../logs")

/**
 * Helper to log scanner requests for debugging
 */
const logScannerRequest = (req) => {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
    const logFile = path.join(logDir, "scanner_requests.log")
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      body: req.body,
      ip: req.ip || req.connection?.remoteAddress,
    }

    fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + "\n---\n")
  } catch (error) {
    console.error("Failed to log scanner request:", error)
  }
}

/**
 * Decode Basic credentials. Device identity is resolved separately.
 */
const readBasicCredentials = (req) => {
  const header = req.headers.authorization || req.headers.Authorization
  if (!header || !/^basic\s+/i.test(header)) return null

  let decoded
  try {
    decoded = Buffer.from(header.replace(/^basic\s+/i, "").trim(), "base64").toString("utf8")
  } catch {
    return null
  }

  const separatorIndex = decoded.indexOf(":")
  if (separatorIndex === -1) return null

  const username = decoded.slice(0, separatorIndex).trim()
  const password = decoded.slice(separatorIndex + 1)
  if (!username) return null

  return { username, password }
}

const tryBasicAuth = async (req) => {
  const credentials = readBasicCredentials(req)
  if (!credentials) return null
  const { username, password } = credentials
  const scanner = await scannerQueries.findActiveScannerByUsername(username)

  if (!scanner) return null

  const isPasswordValid = await bcrypt.compare(password, scanner.passwordHash)
  return isPasswordValid ? scanner : null
}

const scannerData = (scanner) => ({
  _id: scanner._id,
  username: scanner.username,
  name: scanner.name,
  provider: scanner.provider,
  deviceName: scanner.deviceName,
  type: scanner.type,
  direction: scanner.direction,
  hostelId: scanner.hostelId,
  catererId: scanner.catererId,
  isActive: scanner.isActive,
})

/** Authenticate every named device before processing any punches in the batch. */
const authenticateZkteco = async (req) => {
  const credentials = readBasicCredentials(req)
  if (!credentials) return { status: 401, message: "Invalid credentials" }
  const records = Array.isArray(req.body) ? req.body : [req.body]
  const deviceNames = req.method === "GET"
    ? [req.query.deviceName]
    : records.map((record) => record?.TERMINAL_ALIAS)
  if (!deviceNames.length || deviceNames.some((name) => typeof name !== "string" || !name.trim())) {
    return { status: 400, message: "Device name (TERMINAL_ALIAS) is required for every ZKTeco record" }
  }
  const names = [...new Set(deviceNames.map((name) => name.trim()))]
  const scanners = await scannerQueries.findActiveZktecoScannersByDeviceNames(names)
  if (scanners.length !== names.length) return { status: 401, message: "Unknown or inactive ZKTeco device" }
  for (const scanner of scanners) {
    if (credentials.username !== scanner.username || !(await bcrypt.compare(credentials.password, scanner.passwordHash))) {
      return { status: 401, message: "Invalid credentials" }
    }
  }
  return { scanners }
}

/**
 * Legacy custom-header authentication (kept for existing devices).
 * Device sends a header where the name = scanner username and the value =
 * scanner password. Returns the matching scanner document, or null.
 */
const tryHeaderAuth = async (req) => {
  const scanners = await scannerQueries.findActiveScanners()

  for (const scanner of scanners) {
    const headerValue = req.headers[scanner.username.toLowerCase()]
    if (headerValue && (await bcrypt.compare(String(headerValue), scanner.passwordHash))) {
      return scanner
    }
  }

  return null
}

/**
 * Broadcast a raw scanner hit to admin live monitors (the Face Scanners page
 * "Live Monitor"). Fires for every request — success OR failure — so admins can
 * see incoming REST hits, the parsed body, headers, the recognised scanner (if
 * any), and whether auth passed. Never throws; telemetry must not block a scan.
 */
const emitLiveScanEvent = (req, { authSuccess, authMethod, scanner }) => {
  try {
    getIO()
      .to("role:Admin")
      .to("role:Super Admin")
      .emit("face-scanner:live", {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl || req.url,
        ip: req.ip || req.connection?.remoteAddress || null,
        authSuccess,
        authMethod, // "basic" | "header" | null
        scanner: scanner
          ? {
              id: String(scanner._id),
              name: scanner.name,
              provider: scanner.provider,
              deviceName: scanner.deviceName,
              type: scanner.type,
              direction: scanner.direction,
            }
          : null,
        body: req.body ?? null,
        headers: { ...req.headers },
      })
  } catch {
    // Socket.IO not ready / no subscribers — ignore.
  }
}

/**
 * Middleware to authenticate face scanner requests.
 *
 * Supports BOTH schemes, whichever the device provides:
 * 1. HTTP Basic Auth — `Authorization: Basic base64(username:password)`
 * 2. Legacy custom header — header name = username, value = password
 *
 * ZKTeco punches resolve each TERMINAL_ALIAS before validating Basic credentials.
 * Time Watch and unconfigured legacy scanners retain their authentication paths.
 */
export const authenticateScanner = async (req, res, next) => {
  try {
    // Log the request to a file for debugging
    logScannerRequest(req)

    const records = Array.isArray(req.body) ? req.body : [req.body]
    const hasDeviceName = records.some((record) => record && typeof record === "object" && "TERMINAL_ALIAS" in record)
    const credentials = readBasicCredentials(req)
    const basicScanner = await tryBasicAuth(req)
    const authenticatedScanner = basicScanner || (await tryHeaderAuth(req))
    const legacyScanner = authenticatedScanner && !authenticatedScanner.provider
    // A ZKTeco-only username must never fall back to legacy routing when alias is missing.
    const namedAuth = (hasDeviceName && !legacyScanner) || req.query.deviceName !== undefined ||
      (credentials && (await scannerQueries.findScannersByUsername(credentials.username)).some((scanner) => scanner.provider === "zkteco"))

    if (namedAuth) {
      const result = await authenticateZkteco(req)
      emitLiveScanEvent(req, { authSuccess: Boolean(result.scanners), authMethod: "basic", scanner: result.scanners?.[0] })
      if (!result.scanners) return res.status(result.status).json({ isSuccess: "N", outputMessage: result.message })
      req.scannersByDeviceName = new Map(result.scanners.map((scanner) => [scanner.deviceName, scannerData(scanner)]))
      req.scanner = scannerData(result.scanners[0])
      for (const scanner of result.scanners) {
        scannerOwner.touchScannerLastActive(scanner._id).catch((err) => console.error("Error updating scanner lastActiveAt:", err))
      }
      return next()
    }

    const authMethod = basicScanner ? "basic" : authenticatedScanner ? "header" : null

    // Live broadcast to admin monitors (both success and failure).
    emitLiveScanEvent(req, { authSuccess: Boolean(authenticatedScanner), authMethod, scanner: authenticatedScanner })

    if (!authenticatedScanner) {
      console.log("No matching scanner credentials found")
      return res.status(401).json({
        isSuccess: "N",
        outputMessage: "Invalid credentials",
      })
    }

    // Update last active timestamp (non-blocking)
    scannerOwner.touchScannerLastActive(authenticatedScanner._id).catch((err) =>
      console.error("Error updating scanner lastActiveAt:", err)
    )

    // Attach scanner data to request
    req.scanner = scannerData(authenticatedScanner)

    console.log("Scanner authenticated successfully:", req.scanner.name)

    next()
  } catch (error) {
    console.error("Scanner authentication error:", error)
    return res.status(500).json({
      isSuccess: "N",
      outputMessage: "Authentication failed",
    })
  }
}
