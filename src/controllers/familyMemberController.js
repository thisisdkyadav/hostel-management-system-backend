import { familyMemberService } from "../services/familyMember.service.js"

export const createFamilyMember = async (req, res) => {
  const result = await familyMemberService.createFamilyMember(req.params.userId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getFamilyMembers = async (req, res) => {
  const result = await familyMemberService.getFamilyMembers(req.params.userId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateFamilyMember = async (req, res) => {
  const result = await familyMemberService.updateFamilyMember(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteFamilyMember = async (req, res) => {
  const result = await familyMemberService.deleteFamilyMember(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateBulkFamilyMembers = async (req, res) => {
  const result = await familyMemberService.updateBulkFamilyMembers(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
