import { asyncHandler } from "../../../../utils/index.js"
import { getAllocationPeriods, getAllocationRoster, getStudentAllocationHistory } from "./dining-allocations.service.js"

export const allocationPeriods = asyncHandler(async (req, res) => {
  const result = await getAllocationPeriods({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const allocationRoster = asyncHandler(async (req, res) => {
  const result = await getAllocationRoster({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const studentAllocationHistory = asyncHandler(async (req, res) => {
  const result = await getStudentAllocationHistory({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
