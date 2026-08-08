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
 * HTTP Basic Authentication (e.g. Easy TimePro / ZKTeco push).
 * Device sends `Authorization: Basic base64(username:password)` where the
 * username/password are the scanner credentials we issued.
 * Returns the matching scanner document, or null.
 */
const tryBasicAuth = async (req) => {
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

  const scanner = await scannerQueries.findActiveScannerByUsername(username)

  if (!scanner) return null

  const isPasswordValid = await bcrypt.compare(password, scanner.passwordHash)
  return isPasswordValid ? scanner : null
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
 * Basic Auth is tried first (a single indexed lookup); if absent/invalid we
 * fall back to scanning custom headers.
 */
export const authenticateScanner = async (req, res, next) => {
  try {
    // Log the request to a file for debugging
    logScannerRequest(req)

    const basicScanner = await tryBasicAuth(req)
    const authenticatedScanner = basicScanner || (await tryHeaderAuth(req))
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
    req.scanner = {
      _id: authenticatedScanner._id,
      username: authenticatedScanner.username,
      name: authenticatedScanner.name,
      type: authenticatedScanner.type,
      direction: authenticatedScanner.direction,
      hostelId: authenticatedScanner.hostelId,
      catererId: authenticatedScanner.catererId,
      isActive: authenticatedScanner.isActive,
    }

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
