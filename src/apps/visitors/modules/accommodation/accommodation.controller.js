/**
 * Accommodation Controller
 * Thin HTTP layer; delegates to accommodationService and replies with the
 * standard response envelope.
 */

import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { accommodationService } from "./accommodation.service.js"

export const getAccommodationTypes = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.getTypes())
})

export const previewQuote = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.previewQuote(req.body))
})

export const listRequests = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.listRequests(req.user, req.query))
})

export const getRequestById = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.getRequestById(req.params.requestId, req.user))
})

export const submitAccommodationRequest = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.submitRequest(req.body, req.user))
})

export const resubmitRequest = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.resubmitRequest(req.params.requestId, req.body, req.user))
})

export const cancelRequest = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.cancelRequest(req.params.requestId, req.user))
})

// Streams the invoice PDF itself, so it needs the raw response rather than the
// standard envelope. `disposition=attachment` makes the browser download it.
export const getInvoiceFile = asyncHandler(async (req, res) => {
  const result = await accommodationService.getInvoiceFile(req.params.requestId, req.user)
  if (!result.success) {
    return res.status(result.statusCode || 400).json({ success: false, message: result.message })
  }

  const { buffer, contentType, filename } = result.data
  const disposition = String(req.query.disposition || "inline") === "attachment" ? "attachment" : "inline"
  res.setHeader("Content-Type", contentType)
  res.setHeader("Content-Length", buffer.length)
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`)
  return res.end(buffer)
})

export const capacityDecision = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.capacityDecision(req.params.requestId, req.body?.action, req.body, req.user)
  )
})

export const chiefWardenDecision = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.chiefWardenDecision(req.params.requestId, req.body?.action, req.body, req.user)
  )
})

export const bypassFacultyAdvisor = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.bypassFacultyAdvisor(req.params.requestId, req.user))
})

// Payment & allotment (Chief Warden Office + Accountant).
export const issuePaymentRequest = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.issuePaymentRequest(req.params.requestId, req.body, req.user))
})

export const submitPayment = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.submitPayment(req.params.requestId, req.body, req.user))
})

export const settlePaymentManually = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.settlePaymentManually(req.params.requestId, req.body?.action, req.body, req.user)
  )
})

export const adminCancelRequest = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.adminCancelRequest(req.params.requestId, req.body, req.user))
})

export const deferPayment = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.deferPayment(req.params.requestId, req.user))
})

export const verifyPayment = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.verifyPayment(req.params.requestId, req.body?.action, req.body, req.user)
  )
})

export const updatePaymentDetails = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.updatePaymentDetails(req.params.requestId, req.body, req.user)
  )
})

export const requestScheduleChange = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.requestScheduleChange(req.params.requestId, req.body, req.user)
  )
})

export const decideScheduleChange = asyncHandler(async (req, res) => {
  sendStandardResponse(
    res,
    await accommodationService.decideScheduleChange(
      req.params.requestId,
      req.params.changeId,
      req.body,
      req.user
    )
  )
})

// Arrival tail (Supervisor / Gate + CW Office availability).
export const getAllotmentAvailability = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.getAllotmentAvailability(req.params.requestId))
})

export const getRoomAvailability = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.getRoomAvailability(req.params.requestId))
})

export const assignRooms = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.assignRooms(req.params.requestId, req.body, req.user))
})

export const checkIn = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.checkIn(req.params.requestId, req.user))
})

export const checkOut = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.checkOut(req.params.requestId, req.user))
})

// Public (faculty advisor token) endpoints.
export const getRecommendationByToken = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.getRecommendationByToken(req.params.token))
})

export const submitRecommendation = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await accommodationService.submitRecommendation(req.params.token, req.body))
})
