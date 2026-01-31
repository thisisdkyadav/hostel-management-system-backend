import { lostAndFoundService } from "../services/lostAndFound.service.js"
import { asyncHandler } from "../../../utils/controllerHelpers.js"

/**
 * Helper: Error format with message only
 */
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const createLostAndFound = asyncHandler(async (req, res) => {
  const result = await lostAndFoundService.createLostAndFound(req.body)
  sendResponse(res, result)
})

export const getLostAndFound = asyncHandler(async (req, res) => {
  const result = await lostAndFoundService.getLostAndFound()
  sendResponse(res, result)
})

export const updateLostAndFound = asyncHandler(async (req, res) => {
  const result = await lostAndFoundService.updateLostAndFound(req.params.id, req.body)
  sendResponse(res, result)
})

export const deleteLostAndFound = asyncHandler(async (req, res) => {
  const result = await lostAndFoundService.deleteLostAndFound(req.params.id)
  sendResponse(res, result)
})
