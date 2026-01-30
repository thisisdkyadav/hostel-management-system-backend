import { disCoService } from "../services/disCo.service.js"
import { asyncHandler } from "../utils/index.js"

// Helper for error format { message, error }
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const addDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.addDisCoAction(req.body)
  sendWithError(res, result)
})

export const getDisCoActionsByStudent = asyncHandler(async (req, res) => {
  const result = await disCoService.getDisCoActionsByStudent(req.params.studentId)
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json(result.data)
})

export const updateDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.updateDisCoAction(req.params.disCoId, req.body)
  sendWithError(res, result)
})

export const deleteDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.deleteDisCoAction(req.params.disCoId)
  sendWithError(res, result)
})
