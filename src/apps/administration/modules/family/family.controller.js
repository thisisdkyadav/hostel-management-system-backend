import { familyMemberService } from "./family.service.js"
import { asyncHandler } from "../../../../utils/index.js"

// Helper: Error format { message, error }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const createFamilyMember = asyncHandler(async (req, res) => {
  const result = await familyMemberService.createFamilyMember(req.params.userId, req.body)
  sendResponse(res, result)
})

export const getFamilyMembers = asyncHandler(async (req, res) => {
  const result = await familyMemberService.getFamilyMembers(req.params.userId)
  sendResponse(res, result)
})

export const updateFamilyMember = asyncHandler(async (req, res) => {
  const result = await familyMemberService.updateFamilyMember(req.params.id, req.body)
  sendResponse(res, result)
})

export const deleteFamilyMember = asyncHandler(async (req, res) => {
  const result = await familyMemberService.deleteFamilyMember(req.params.id)
  sendResponse(res, result)
})

export const updateBulkFamilyMembers = asyncHandler(async (req, res) => {
  const result = await familyMemberService.updateBulkFamilyMembers(req.body)
  sendResponse(res, result)
})
