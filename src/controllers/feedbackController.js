import { feedbackService } from "../services/feedback.service.js"

export const createFeedback = async (req, res) => {
  const result = await feedbackService.createFeedback(req.body, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

export const getFeedbacks = async (req, res) => {
  const result = await feedbackService.getFeedbacks(req.query, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateFeedbackStatus = async (req, res) => {
  const result = await feedbackService.updateFeedbackStatus(req.params.feedbackId, req.body.status)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

export const replyToFeedback = async (req, res) => {
  const result = await feedbackService.replyToFeedback(req.params.feedbackId, req.body.reply)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateFeedback = async (req, res) => {
  const result = await feedbackService.updateFeedback(req.params.feedbackId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteFeedback = async (req, res) => {
  const result = await feedbackService.deleteFeedback(req.params.feedbackId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
}

export const getStudentFeedbacks = async (req, res) => {
  const result = await feedbackService.getStudentFeedbacks(req.params.userId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
