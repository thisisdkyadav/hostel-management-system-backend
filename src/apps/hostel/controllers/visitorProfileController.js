import { visitorProfileService } from "../services/visitorProfile.service.js"
import { asyncHandler } from "../../../utils/index.js"

export const getVisitorProfiles = asyncHandler(async (req, res) => {
  const result = await visitorProfileService.getVisitorProfiles(req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json(result.data)
})

export const createVisitorProfile = asyncHandler(async (req, res) => {
  const result = await visitorProfileService.createVisitorProfile(req.user._id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
})

export const updateVisitorProfile = asyncHandler(async (req, res) => {
  const result = await visitorProfileService.updateVisitorProfile(req.params.visitorId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
})

export const deleteVisitorProfile = asyncHandler(async (req, res) => {
  const result = await visitorProfileService.deleteVisitorProfile(req.params.visitorId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json(result.data)
})
