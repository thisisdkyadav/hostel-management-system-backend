import { asyncHandler } from "../../../../utils/index.js"
import {
  getCurrentMealAvailableStudents,
  getCurrentMealScope,
  getDiningMealVerificationContext,
  getDiningMealVerificationFeed,
  resolveCatererForUser,
  verifyDiningMeal,
} from "./dining-meal-verification.service.js"

export const getMealVerificationContext = asyncHandler(async (req, res) => {
  const result = await getDiningMealVerificationContext({ user: req.user })
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  })
})

export const getMealVerificationFeed = asyncHandler(async (req, res) => {
  const caterer = await resolveCatererForUser(req.user)
  if (!caterer) {
    return res.status(404).json({ success: false, message: "Caterer login not found" })
  }

  const { period, mealSlot } = await getCurrentMealScope(new Date())
  const result = await getDiningMealVerificationFeed({
    ...req.query,
    catererId: caterer._id,
    periodId: period?._id,
    mealSlotKey: mealSlot?.key || "__no_active_meal__",
  })
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  })
})

export const getAvailableStudents = asyncHandler(async (req, res) => {
  const result = await getCurrentMealAvailableStudents({ user: req.user })
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  })
})

export const manuallyVerifyMeal = asyncHandler(async (req, res) => {
  const caterer = await resolveCatererForUser(req.user)
  if (!caterer) {
    return res.status(404).json({ success: false, message: "Caterer login not found" })
  }

  const result = await verifyDiningMeal({
    rollNumber: req.body?.rollNumber,
    catererId: caterer._id,
    scannedAt: req.body?.scannedAt ? new Date(req.body.scannedAt) : new Date(),
    source: "manual",
  })

  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  })
})
