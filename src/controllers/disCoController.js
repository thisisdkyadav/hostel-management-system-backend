import { disCoService } from "../services/disCo.service.js"

export const addDisCoAction = async (req, res) => {
  const result = await disCoService.addDisCoAction(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getDisCoActionsByStudent = async (req, res) => {
  const result = await disCoService.getDisCoActionsByStudent(req.params.studentId)
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateDisCoAction = async (req, res) => {
  const result = await disCoService.updateDisCoAction(req.params.disCoId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteDisCoAction = async (req, res) => {
  const result = await disCoService.deleteDisCoAction(req.params.disCoId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
