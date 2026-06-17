/**
 * Dining Office Controller
 * HTTP layer for the Dining Office portal (read-only oversight).
 *
 * @module controllers/dining-office
 */

import { getDiningOfficeDashboard } from "./dining-office-dashboard.service.js"
import { asyncHandler } from "../../../../utils/index.js"

export const getDashboard = asyncHandler(async (req, res) => {
  const result = await getDiningOfficeDashboard()

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message })
  }

  res.status(result.statusCode).json({ success: true, message: result.message, data: result.data })
})
