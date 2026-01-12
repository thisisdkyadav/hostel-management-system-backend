import * as faceScannerService from "../services/faceScannerService.js"

/**
 * Create a new face scanner
 * POST /api/face-scanner
 */
export const createFaceScanner = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error creating face scanner:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create scanner",
      error: error.message,
    })
  }
}

/**
 * Get all face scanners
 * GET /api/face-scanner
 */
export const getAllFaceScanners = async (req, res) => {
  try {
    const scanners = await faceScannerService.getAllScanners(req.query)

    res.status(200).json({
      success: true,
      data: scanners,
    })
  } catch (error) {
    console.error("Error fetching face scanners:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch scanners",
      error: error.message,
    })
  }
}

/**
 * Get face scanner by ID
 * GET /api/face-scanner/:id
 */
export const getFaceScannerById = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error fetching face scanner:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch scanner",
      error: error.message,
    })
  }
}

/**
 * Update face scanner
 * PUT /api/face-scanner/:id
 */
export const updateFaceScanner = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error updating face scanner:", error)
    res.status(500).json({
      success: false,
      message: "Failed to update scanner",
      error: error.message,
    })
  }
}

/**
 * Delete face scanner
 * DELETE /api/face-scanner/:id
 */
export const deleteFaceScanner = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error deleting face scanner:", error)
    res.status(500).json({
      success: false,
      message: "Failed to delete scanner",
      error: error.message,
    })
  }
}

/**
 * Regenerate scanner password
 * POST /api/face-scanner/:id/regenerate-password
 */
export const regeneratePassword = async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Error regenerating password:", error)
    res.status(500).json({
      success: false,
      message: "Failed to regenerate password",
      error: error.message,
    })
  }
}

/**
 * Test scanner authentication (for debugging)
 * GET /api/face-scanner/test-auth
 * Requires scanner auth header
 */
export const testScannerAuth = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Scanner authenticated successfully",
    scanner: req.scanner,
  })
}
