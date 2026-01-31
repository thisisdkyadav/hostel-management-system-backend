import { feedbackService } from "../services/feedback.service.js"
import { asyncHandler } from "../../../utils/controllerHelpers.js"

/**
 * Helper: Error format with success: false
 */
const sendWithSuccess = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

/**
 * Helper: Error format with error field
 */
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const createFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.createFeedback(req.body, req.user)
  sendWithSuccess(res, result)
})

export const getFeedbacks = asyncHandler(async (req, res) => {
  const result = await feedbackService.getFeedbacks(req.query, req.user)
  sendWithError(res, result)
})

export const updateFeedbackStatus = asyncHandler(async (req, res) => {
  const result = await feedbackService.updateFeedbackStatus(req.params.feedbackId, req.body.status)
  sendWithSuccess(res, result)
})

export const replyToFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.replyToFeedback(req.params.feedbackId, req.body.reply)
  sendWithSuccess(res, result)
})

export const updateFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.updateFeedback(req.params.feedbackId, req.body)
  sendWithSuccess(res, result)
})

export const deleteFeedback = asyncHandler(async (req, res) => {
  const result = await feedbackService.deleteFeedback(req.params.feedbackId)
  sendWithSuccess(res, result)
})

export const getStudentFeedbacks = asyncHandler(async (req, res) => {
  const result = await feedbackService.getStudentFeedbacks(req.params.userId)
  sendWithError(res, result)
})
