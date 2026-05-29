import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { porService } from "./por.service.js"

export const getWorkspace = asyncHandler(async (req, res) => {
  const result = await porService.getWorkspace(req.user)
  sendStandardResponse(res, result)
})

export const getStudentPorRequests = asyncHandler(async (req, res) => {
  const result = await porService.getStudentPorRequests(req.params.userId, req.user)
  sendStandardResponse(res, result)
})

export const createPorRequest = asyncHandler(async (req, res) => {
  const result = await porService.createPorRequest(req.body, req.user)
  sendStandardResponse(res, result)
})

export const createPorCategory = asyncHandler(async (req, res) => {
  const result = await porService.createPorCategory(req.body, req.user)
  sendStandardResponse(res, result)
})

export const updatePorRequest = asyncHandler(async (req, res) => {
  const result = await porService.updatePorRequest(req.params.id, req.body, req.user)
  sendStandardResponse(res, result)
})

export const updatePorCategory = asyncHandler(async (req, res) => {
  const result = await porService.updatePorCategory(req.params.categoryId, req.body, req.user)
  sendStandardResponse(res, result)
})

export const approvePorRequest = asyncHandler(async (req, res) => {
  const result = await porService.approvePorRequest(
    req.params.id,
    req.body.comments,
    req.user,
    req.body.nextApprovalStages,
    req.body.nextApprovers,
    req.body.directApprove
  )
  sendStandardResponse(res, result)
})

export const rejectPorRequest = asyncHandler(async (req, res) => {
  const result = await porService.rejectPorRequest(req.params.id, req.body.reason, req.user)
  sendStandardResponse(res, result)
})

export const requestPorRevision = asyncHandler(async (req, res) => {
  const result = await porService.requestPorRevision(req.params.id, req.body.comments, req.user)
  sendStandardResponse(res, result)
})

export const getApprovalHistory = asyncHandler(async (req, res) => {
  const result = await porService.getApprovalHistory(req.params.id, req.user)
  sendStandardResponse(res, result)
})

export default {
  getWorkspace,
  getStudentPorRequests,
  createPorRequest,
  createPorCategory,
  updatePorRequest,
  updatePorCategory,
  approvePorRequest,
  rejectPorRequest,
  requestPorRevision,
  getApprovalHistory,
}
