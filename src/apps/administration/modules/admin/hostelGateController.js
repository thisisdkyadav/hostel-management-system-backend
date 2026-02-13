import { hostelGateService } from "./hostelGate.service.js"
import { asyncHandler } from "../../../../utils/index.js"

// Helper: Error format { message }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const createHostelGate = asyncHandler(async (req, res) => {
  const result = await hostelGateService.createHostelGate(req.body)
  sendResponse(res, result)
})

export const getAllHostelGates = asyncHandler(async (req, res) => {
  const result = await hostelGateService.getAllHostelGates()
  sendResponse(res, result)
})

export const updateHostelGate = asyncHandler(async (req, res) => {
  const result = await hostelGateService.updateHostelGate(req.params.hostelId, req.body)
  sendResponse(res, result)
})

export const deleteHostelGate = asyncHandler(async (req, res) => {
  const result = await hostelGateService.deleteHostelGate(req.params.hostelId)
  sendResponse(res, result)
})

export const getHostelGateProfile = asyncHandler(async (req, res) => {
  const result = await hostelGateService.getHostelGateProfile(req.params.hostelId)
  sendResponse(res, result)
})
