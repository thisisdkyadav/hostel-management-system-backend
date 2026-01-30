import * as faceScannerService from "../services/faceScanner.service.js"
import { asyncHandler } from "../utils/index.js"

/**
 * Create a new face scanner
 * POST /api/face-scanner
 */
export const createFaceScanner = asyncHandler(async (req, res) => {
  const { name, type, direction, hostelId } = req.body

  if (!name || !type || !direction) {
    return res.status(400).json({
      success: false,
      message: "Name, type, and direction are required",
    })
  }

  const { scanner, plainPassword } = await faceScannerService.createScanner({
    name,
    type,
    direction,
    hostelId,
  })

  res.status(201).json({
    success: true,
    message: "Scanner created successfully. Save the credentials - the password will not be shown again.",
    data: {
      scanner,
      credentials: {
        username: scanner.username,
        password: plainPassword,
      },
    },
  })
})

/**
 * Get all face scanners
 * GET /api/face-scanner
 */
export const getAllFaceScanners = asyncHandler(async (req, res) => {
  const scanners = await faceScannerService.getAllScanners(req.query)

  res.status(200).json({
    success: true,
    data: scanners,
  })
})

/**
 * Get face scanner by ID
 * GET /api/face-scanner/:id
 */
export const getFaceScannerById = asyncHandler(async (req, res) => {
  const scanner = await faceScannerService.getScannerById(req.params.id)

  if (!scanner) {
    return res.status(404).json({
      success: false,
      message: "Scanner not found",
    })
  }

  res.status(200).json({
    success: true,
    data: scanner,
  })
})

/**
 * Update face scanner
 * PUT /api/face-scanner/:id
 */
export const updateFaceScanner = asyncHandler(async (req, res) => {
  const { name, type, direction, hostelId, isActive } = req.body

  const scanner = await faceScannerService.updateScanner(req.params.id, {
    name,
    type,
    direction,
    hostelId,
    isActive,
  })

  if (!scanner) {
    return res.status(404).json({
      success: false,
      message: "Scanner not found",
    })
  }

  res.status(200).json({
    success: true,
    message: "Scanner updated successfully",
    data: scanner,
  })
})

/**
 * Delete face scanner
 * DELETE /api/face-scanner/:id
 */
export const deleteFaceScanner = asyncHandler(async (req, res) => {
  const deleted = await faceScannerService.deleteScanner(req.params.id)

  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: "Scanner not found",
    })
  }

  res.status(200).json({
    success: true,
    message: "Scanner deleted successfully",
  })
})

/**
 * Regenerate scanner password
 * POST /api/face-scanner/:id/regenerate-password
 */
export const regeneratePassword = asyncHandler(async (req, res) => {
  const result = await faceScannerService.regeneratePassword(req.params.id)

  if (!result) {
    return res.status(404).json({
      success: false,
      message: "Scanner not found",
    })
  }

  res.status(200).json({
    success: true,
    message: "Password regenerated successfully. Save the new password - it will not be shown again.",
    data: {
      scanner: result.scanner,
      credentials: {
        username: result.scanner.username,
        password: result.plainPassword,
      },
    },
  })
})

/**
 * Test scanner authentication (for debugging)
 * GET /api/face-scanner/test-auth
 * Requires scanner auth header
 */
export const testScannerAuth = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Scanner authenticated successfully",
    scanner: req.scanner,
  })
})
