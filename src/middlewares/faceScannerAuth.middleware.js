/**
 * Face Scanner Authentication Middleware
 * Handles authentication for face scanner devices
 */
// Using old model path until Phase 3 (Models Migration)
import FaceScanner from "../../models/FaceScanner.js"
import bcrypt from "bcrypt"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

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
 * Middleware to authenticate face scanner requests using custom header
 *
 * Authentication method:
 * - Scanner has username (header key) and password (header value)
 * - Device sends a custom header where:
 *   - Header name = scanner's username (e.g., "abc")
 *   - Header value = scanner's password (e.g., "123")
 * - We find all scanners and check if any header matches
 */
export const authenticateScanner = async (req, res, next) => {
  try {
    // Log the request to a file for debugging
    logScannerRequest(req)

    // Get all active scanners
    const scanners = await FaceScanner.find({ isActive: true }).populate("hostelId", "name type")

    if (scanners.length === 0) {
      return res.status(401).json({
        isSuccess: "N",
        outputMessage: "No scanners registered",
      })
    }

    // Check each scanner to see if its username (header key) exists in request headers
    let authenticatedScanner = null

    for (const scanner of scanners) {
      const headerKey = scanner.username.toLowerCase()
      const headerValue = req.headers[headerKey]

      if (headerValue) {
        // Header exists, verify the password
        const isPasswordValid = await bcrypt.compare(headerValue, scanner.passwordHash)

        if (isPasswordValid) {
          authenticatedScanner = scanner
          break
        }
      }
    }

    if (!authenticatedScanner) {
      console.log("No matching scanner auth header found")
      return res.status(401).json({
        isSuccess: "N",
        outputMessage: "Invalid credentials",
      })
    }

    // Update last active timestamp (non-blocking)
    FaceScanner.findByIdAndUpdate(authenticatedScanner._id, { lastActiveAt: new Date() }).catch((err) =>
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
