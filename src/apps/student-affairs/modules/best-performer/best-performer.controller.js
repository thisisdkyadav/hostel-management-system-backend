import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { bestPerformerService } from "./best-performer.service.js"

export const createOccurrence = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.createOccurrence(req.body, req.user)
  return sendStandardResponse(res, result)
})

export const updateOccurrence = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.updateOccurrence(req.params.id, req.body, req.user)
  return sendStandardResponse(res, result)
})

export const getOccurrenceSelector = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.getOccurrenceSelector()
  return sendStandardResponse(res, result)
})

export const getOccurrenceDetail = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.getOccurrenceDetail(req.params.id)
  return sendStandardResponse(res, result)
})

export const getStudentPortalState = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.getStudentPortalState(req.user)
  return sendStandardResponse(res, result)
})

export const upsertStudentApplication = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.upsertStudentApplication(req.params.id, req.body, req.user)
  return sendStandardResponse(res, result)
})

export const reviewApplication = asyncHandler(async (req, res) => {
  const result = await bestPerformerService.reviewApplication(req.params.id, req.body, req.user)
  return sendStandardResponse(res, result)
})
