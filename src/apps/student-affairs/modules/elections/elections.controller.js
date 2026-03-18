import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { electionsService } from "./elections.service.js"

export const listAdminElections = asyncHandler(async (req, res) => {
  const result = await electionsService.listAdminElections(req.query)
  return sendStandardResponse(res, result)
})

export const getElectionDetail = asyncHandler(async (req, res) => {
  const result = await electionsService.getElectionDetail(req.params.id, req.user)
  return sendStandardResponse(res, result)
})

export const createElection = asyncHandler(async (req, res) => {
  const result = await electionsService.createElection(req.body, req.user)
  return sendStandardResponse(res, result)
})

export const updateElection = asyncHandler(async (req, res) => {
  const result = await electionsService.updateElection(req.params.id, req.body, req.user)
  return sendStandardResponse(res, result)
})

export const getStudentPortalState = asyncHandler(async (req, res) => {
  const result = await electionsService.getStudentPortalState(req.user)
  return sendStandardResponse(res, result)
})

export const getStudentCurrentElections = asyncHandler(async (req, res) => {
  const result = await electionsService.getStudentCurrentElections(req.user)
  return sendStandardResponse(res, result)
})

export const lookupNominationSupporter = asyncHandler(async (req, res) => {
  const result = await electionsService.lookupNominationSupporter(
    req.params.id,
    req.params.postId,
    req.query,
    req.user
  )
  return sendStandardResponse(res, result)
})

export const upsertNomination = asyncHandler(async (req, res) => {
  const result = await electionsService.upsertNomination(
    req.params.id,
    req.params.postId,
    req.body,
    req.user
  )
  return sendStandardResponse(res, result)
})

export const withdrawNomination = asyncHandler(async (req, res) => {
  const result = await electionsService.withdrawNomination(req.params.id, req.params.nominationId, req.user)
  return sendStandardResponse(res, result)
})

export const reviewNomination = asyncHandler(async (req, res) => {
  const result = await electionsService.reviewNomination(
    req.params.id,
    req.params.nominationId,
    req.body,
    req.user
  )
  return sendStandardResponse(res, result)
})

export const castVote = asyncHandler(async (req, res) => {
  const result = await electionsService.castVote(
    req.params.id,
    req.params.postId,
    req.body,
    req.user
  )
  return sendStandardResponse(res, result)
})

export const publishResults = asyncHandler(async (req, res) => {
  const result = await electionsService.publishResults(req.params.id, req.body, req.user)
  return sendStandardResponse(res, result)
})

export const getSupporterConfirmationByToken = asyncHandler(async (req, res) => {
  const result = await electionsService.getSupporterConfirmationByToken(req.params.token)
  return sendStandardResponse(res, result)
})

export const respondToSupporterConfirmation = asyncHandler(async (req, res) => {
  const result = await electionsService.respondToSupporterConfirmation(req.params.token, req.body)
  return sendStandardResponse(res, result)
})

export default {
  listAdminElections,
  getElectionDetail,
  createElection,
  updateElection,
  getStudentPortalState,
  getStudentCurrentElections,
  lookupNominationSupporter,
  upsertNomination,
  withdrawNomination,
  reviewNomination,
  castVote,
  publishResults,
  getSupporterConfirmationByToken,
  respondToSupporterConfirmation,
}
