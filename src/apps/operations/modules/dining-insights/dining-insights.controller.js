import { asyncHandler } from "../../../../utils/index.js"
import { getDiningInsightsOverview } from "./dining-insights.service.js"

export const overview = asyncHandler(async (req, res) => {
  const result = await getDiningInsightsOverview({ query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
