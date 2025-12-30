import * as scannerActionService from "../services/scannerActionService.js"

/**
 * Scanner Action Controller
 * Handles automated actions from scanner machines
 * All routes use scanner authentication (Basic Auth)
 */

/**
 * Process scan - creates entry directly (automated, no manual verification)
 * POST /api/face-scanner/scan
 */
export const processScan = async (req, res) => {
  const scanner = req.scanner
  const { rollNumber } = req.body

  try {
    if (!rollNumber) {
      return res.status(400).json({
        success: false,
        message: "Roll number is required",
      })
    }

    // Route to appropriate handler based on scanner type
    switch (scanner.type) {
      case "hostel-gate":
        const result = await scannerActionService.processHostelGateEntry(scanner, rollNumber)
        return res.status(result.status).json({
          success: result.success,
          message: result.message,
          data: result.data,
        })

      default:
        return res.status(400).json({
          success: false,
          message: `Unknown scanner type: ${scanner.type}`,
        })
    }
  } catch (error) {
    console.error("Error processing scan:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to process scan",
      error: error.message,
    })
  }
}

/**
 * Health check for scanner
 * GET /api/face-scanner/ping
 */
export const ping = async (req, res) => {
  res.status(200).json({
    success: true,
    message: "Scanner connected",
    scanner: {
      name: req.scanner.name,
      type: req.scanner.type,
      direction: req.scanner.direction,
    },
    timestamp: new Date(),
  })
}
