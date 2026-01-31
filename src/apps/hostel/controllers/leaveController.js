import { leaveService } from "../services/leave.service.js"
import { asyncHandler } from "../../../utils/index.js"

// Helper: Error format { message, error } (for getLeaves variants)
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// Helper: Error format { message, success } (for approve/reject/join)
const sendWithSuccess = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json({ ...result.data, success: true })
}

/**
 * Create a new leave
 */
export const createLeave = asyncHandler(async (req, res) => {
  const result = await leaveService.createLeave(req.body, req.user._id)
  sendWithError(res, result)
})

/**
 * Get all leaves for a specific user
 */
export const getMyLeaves = asyncHandler(async (req, res) => {
  const result = await leaveService.getMyLeaves(req.user._id)
  sendWithError(res, result)
})

/**
 * Get all leaves with pagination and filters query
 */
export const getLeaves = asyncHandler(async (req, res) => {
  const result = await leaveService.getLeaves(req.query)
  sendWithError(res, result)
})

/**
 * Approve a leave
 */
export const approveLeave = asyncHandler(async (req, res) => {
  const result = await leaveService.approveLeave(req.params.id, req.body, req.user._id)
  sendWithSuccess(res, result)
})

/**
 * Reject a leave
 */
export const rejectLeave = asyncHandler(async (req, res) => {
  const result = await leaveService.rejectLeave(req.params.id, req.body, req.user._id)
  sendWithSuccess(res, result)
})

/**
 * Join a leave
 */
export const joinLeave = asyncHandler(async (req, res) => {
  const result = await leaveService.joinLeave(req.params.id, req.body)
  sendWithSuccess(res, result)
})
