import FaceScanner from "../models/FaceScanner.js"
import bcrypt from "bcrypt"

/**
 * Middleware to authenticate face scanner requests using Basic Auth
 * Extracts credentials from Authorization header, verifies against database
 * Attaches scanner info to req.scanner on success
 */
export const authenticateScanner = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Use Basic Auth with scanner credentials.",
      })
    }

    // Decode Base64 credentials
    const base64Credentials = authHeader.slice(6)
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf8")
    const [username, password] = credentials.split(":")

    if (!username || !password) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials format",
      })
    }

    // Find scanner by username
    const scanner = await FaceScanner.findOne({ username }).populate("hostelId", "name type")

    if (!scanner) {
      return res.status(401).json({
        success: false,
        message: "Invalid scanner credentials",
      })
    }

    // Check if scanner is active
    if (!scanner.isActive) {
      return res.status(403).json({
        success: false,
        message: "Scanner is deactivated",
      })
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, scanner.passwordHash)

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid scanner credentials",
      })
    }

    // Update last active timestamp (non-blocking)
    FaceScanner.findByIdAndUpdate(scanner._id, { lastActiveAt: new Date() }).catch((err) =>
      console.error("Error updating scanner lastActiveAt:", err)
    )

    // Attach scanner data to request
    req.scanner = {
      _id: scanner._id,
      username: scanner.username,
      name: scanner.name,
      type: scanner.type,
      direction: scanner.direction,
      hostelId: scanner.hostelId,
      isActive: scanner.isActive,
    }

    next()
  } catch (error) {
    console.error("Scanner authentication error:", error)
    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    })
  }
}
