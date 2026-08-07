/**
 * Dining Allocation Controller
 * Admin management of caterer-wise student lists for a dining period.
 */

import { diningAllocationService } from "./dining-allocation.service.js"
import { asyncHandler } from "../../../../utils/index.js"

const sendResult = (res, result) =>
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data })

export const getPeriodAllocations = asyncHandler(async (req, res) => {
  sendResult(res, await diningAllocationService.getPeriodAllocations(req.params.id))
})

export const assignStudentAllocation = asyncHandler(async (req, res) => {
  sendResult(res, await diningAllocationService.assignStudent(req.params.id, req.body))
})

export const bulkAssignAllocations = asyncHandler(async (req, res) => {
  sendResult(res, await diningAllocationService.bulkAssign(req.params.id, req.body))
})

export const removeStudentAllocation = asyncHandler(async (req, res) => {
  sendResult(res, await diningAllocationService.removeStudent(req.params.id, req.params.studentUserId))
})

export const reconcileAllocations = asyncHandler(async (req, res) => {
  sendResult(res, await diningAllocationService.reconcile(req.params.id))
})
