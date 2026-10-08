import { asyncHandler } from "../../../../utils/index.js"
import { getMealRecordOptions, getMealRecordOverview, getMealRecords } from "./dining-caterer.meal-records.service.js"
import { getRebateOverview, getRebateDay, getRebates } from "./dining-caterer.rebates.service.js"

export const mealRecordOptions = asyncHandler(async (req, res) => {
  const result = await getMealRecordOptions({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const mealRecordOverview = asyncHandler(async (req, res) => {
  const result = await getMealRecordOverview({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const mealRecords = asyncHandler(async (req, res) => {
  const result = await getMealRecords({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const rebateOverview = asyncHandler(async (req, res) => {
  const result = await getRebateOverview({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const rebateDay = asyncHandler(async (req, res) => {
  const result = await getRebateDay({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
export const rebates = asyncHandler(async (req, res) => {
  const result = await getRebates({ user: req.user, query: req.query })
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })
})
