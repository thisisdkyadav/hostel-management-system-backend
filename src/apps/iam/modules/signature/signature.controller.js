/**
 * Signature Controller
 * HTTP handlers for self-service signature management and the admin signatory directory.
 */

import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { signatureService } from "./signature.service.js"

export const getMySignature = asyncHandler(async (req, res) => {
  const result = await signatureService.getMySignature(req.user)
  sendStandardResponse(res, result)
})

export const updateMySignature = asyncHandler(async (req, res) => {
  const result = await signatureService.updateMySignature(req.user, req.body)
  sendStandardResponse(res, result)
})

export const deleteMySignature = asyncHandler(async (req, res) => {
  const result = await signatureService.deleteMySignature(req.user)
  sendStandardResponse(res, result)
})

export const listSignatories = asyncHandler(async (req, res) => {
  const result = await signatureService.listSignatories({ search: req.query.search })
  sendStandardResponse(res, result)
})

export default {
  getMySignature,
  updateMySignature,
  deleteMySignature,
  listSignatories,
}
