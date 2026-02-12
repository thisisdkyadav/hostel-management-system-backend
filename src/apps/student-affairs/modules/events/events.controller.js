/**
 * @fileoverview Events Controller
 * @description HTTP handlers for all events operations
 */

import { asyncHandler, sendRawResponse } from "../../../../utils/controllerHelpers.js"
import { calendarService } from "./calendar.service.js"
import { proposalService } from "./proposal.service.js"
import { expenseService } from "./expense.service.js"
import { amendmentService } from "./amendment.service.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import { success } from "../../../../services/base/ServiceResponse.js"

const computeProposalDueDate = (event) => {
  const existingDueDate = event?.proposalDueDate ? new Date(event.proposalDueDate) : null
  if (existingDueDate && !Number.isNaN(existingDueDate.getTime())) {
    return existingDueDate
  }

  const startDate = event?.scheduledStartDate ? new Date(event.scheduledStartDate) : null
  if (!startDate || Number.isNaN(startDate.getTime())) {
    return null
  }

  const dueDate = new Date(startDate)
  dueDate.setDate(dueDate.getDate() - 21)
  return dueDate
}

const enrichEventWithProposalDueDate = (eventDoc) => {
  if (!eventDoc) return eventDoc
  const serialized = typeof eventDoc.toObject === "function" ? eventDoc.toObject() : eventDoc
  const proposalDueDate = computeProposalDueDate(serialized)
  if (!proposalDueDate) {
    return serialized
  }
  return {
    ...serialized,
    proposalDueDate,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CALENDAR CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.createCalendar(req.body, req.user)
  sendRawResponse(res, result)
})

export const updateCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.updateCalendar(req.params.id, req.body, req.user)
  sendRawResponse(res, result)
})

export const submitCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.submitCalendar(req.params.id, req.user, req.body)
  sendRawResponse(res, result)
})

export const checkCalendarOverlap = asyncHandler(async (req, res) => {
  const result = await calendarService.checkEventOverlap(req.params.id, req.body)
  sendRawResponse(res, result)
})

export const approveCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.approveCalendar(
    req.params.id,
    req.body.comments,
    req.user,
    req.body.nextApprovalStages
  )
  sendRawResponse(res, result)
})

export const rejectCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.rejectCalendar(req.params.id, req.body.reason, req.user)
  sendRawResponse(res, result)
})

export const getCalendarById = asyncHandler(async (req, res) => {
  const result = await calendarService.getCalendarById(req.params.id)
  sendRawResponse(res, result)
})

export const getCalendarByYear = asyncHandler(async (req, res) => {
  const result = await calendarService.getCalendarByYear(req.params.year)
  sendRawResponse(res, result)
})

export const getCalendars = asyncHandler(async (req, res) => {
  const result = await calendarService.getCalendars(req.query, req.user)
  sendRawResponse(res, result)
})

export const getCalendarHistory = asyncHandler(async (req, res) => {
  const result = await calendarService.getApprovalHistory(req.params.id)
  sendRawResponse(res, result)
})

export const lockCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.lockCalendar(req.params.id, req.user)
  sendRawResponse(res, result)
})

export const unlockCalendar = asyncHandler(async (req, res) => {
  const result = await calendarService.unlockCalendar(req.params.id, req.user)
  sendRawResponse(res, result)
})

export const getAcademicYears = asyncHandler(async (req, res) => {
  const result = await calendarService.getAcademicYears()
  sendRawResponse(res, result)
})

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.createProposal(req.params.eventId, req.body, req.user)
  sendRawResponse(res, result)
})

export const updateProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.updateProposal(req.params.id, req.body, req.user)
  sendRawResponse(res, result)
})

export const approveProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.approveProposal(
    req.params.id,
    req.body.comments,
    req.user,
    req.body.nextApprovalStages
  )
  sendRawResponse(res, result)
})

export const rejectProposal = asyncHandler(async (req, res) => {
  const result = await proposalService.rejectProposal(req.params.id, req.body.reason, req.user)
  sendRawResponse(res, result)
})

export const requestProposalRevision = asyncHandler(async (req, res) => {
  const result = await proposalService.requestRevision(req.params.id, req.body.comments, req.user)
  sendRawResponse(res, result)
})

export const getProposalById = asyncHandler(async (req, res) => {
  const result = await proposalService.getProposalById(req.params.id)
  sendRawResponse(res, result)
})

export const getProposalByEvent = asyncHandler(async (req, res) => {
  const result = await proposalService.getProposalByEvent(req.params.eventId)
  sendRawResponse(res, result)
})

export const getPendingProposals = asyncHandler(async (req, res) => {
  const daysUntilDue = req.query.daysUntilDue ? parseInt(req.query.daysUntilDue) : 21
  const result = await proposalService.getPendingProposals(daysUntilDue)
  sendRawResponse(res, result)
})

export const getProposalsForApproval = asyncHandler(async (req, res) => {
  const result = await proposalService.getProposalsForApproval(req.user)
  sendRawResponse(res, result)
})

export const getProposalHistory = asyncHandler(async (req, res) => {
  const result = await proposalService.getApprovalHistory(req.params.id)
  sendRawResponse(res, result)
})

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const submitExpense = asyncHandler(async (req, res) => {
  const result = await expenseService.submitExpense(req.params.eventId, req.body, req.user)
  sendRawResponse(res, result)
})

export const updateExpense = asyncHandler(async (req, res) => {
  const result = await expenseService.updateExpense(req.params.id, req.body, req.user)
  sendRawResponse(res, result)
})

export const getExpenseById = asyncHandler(async (req, res) => {
  const result = await expenseService.getExpenseById(req.params.id)
  sendRawResponse(res, result)
})

export const getExpenseByEvent = asyncHandler(async (req, res) => {
  const result = await expenseService.getExpenseByEvent(req.params.eventId)
  sendRawResponse(res, result)
})

export const getAllExpenses = asyncHandler(async (req, res) => {
  const result = await expenseService.getAllExpenses(req.query, req.user)
  sendRawResponse(res, result)
})

export const getExpenseHistory = asyncHandler(async (req, res) => {
  const result = await expenseService.getApprovalHistory(req.params.id)
  sendRawResponse(res, result)
})

export const approveExpense = asyncHandler(async (req, res) => {
  const result = await expenseService.approveExpense(
    req.params.id,
    req.body.comments,
    req.user,
    req.body.nextApprovalStages
  )
  sendRawResponse(res, result)
})

export const rejectExpense = asyncHandler(async (req, res) => {
  const result = await expenseService.rejectExpense(req.params.id, req.body.reason, req.user)
  sendRawResponse(res, result)
})

// ═══════════════════════════════════════════════════════════════════════════════
// AMENDMENT CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const createAmendment = asyncHandler(async (req, res) => {
  const result = await amendmentService.createAmendment(req.body, req.user)
  sendRawResponse(res, result)
})

export const approveAmendment = asyncHandler(async (req, res) => {
  const result = await amendmentService.approveAmendment(req.params.id, req.body.reviewComments, req.user)
  sendRawResponse(res, result)
})

export const rejectAmendment = asyncHandler(async (req, res) => {
  const result = await amendmentService.rejectAmendment(req.params.id, req.body.reviewComments, req.user)
  sendRawResponse(res, result)
})

export const getPendingAmendments = asyncHandler(async (req, res) => {
  const result = await amendmentService.getPendingAmendments()
  sendRawResponse(res, result)
})

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const getEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, category, calendarId } = req.query
  
  const filter = {}
  if (status) filter.status = status
  if (category) filter.category = category
  if (calendarId) filter.calendarId = calendarId
  
  const events = await GymkhanaEvent.find(filter)
    .populate("calendarId", "academicYear")
    .sort({ scheduledStartDate: 1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit))

  const enrichedEvents = events.map(enrichEventWithProposalDueDate)
  
  const total = await GymkhanaEvent.countDocuments(filter)
  
  sendRawResponse(res, success({
    events: enrichedEvents,
    pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
  }))
})

export const getEventById = asyncHandler(async (req, res) => {
  const event = await GymkhanaEvent.findById(req.params.id)
    .populate("calendarId", "academicYear")
    .populate("proposalId")
    .populate("expenseId")
  
  if (!event) {
    return sendRawResponse(res, { success: false, statusCode: 404, message: "Event not found" })
  }
  
  sendRawResponse(res, success({ event: enrichEventWithProposalDueDate(event) }))
})

export const getCalendarView = asyncHandler(async (req, res) => {
  const { year, month, startDate, endDate } = req.query
  
  const filter = {}
  let rangeStart = null
  let rangeEnd = null
  
  if (startDate && endDate) {
    rangeStart = new Date(startDate)
    rangeEnd = new Date(endDate)
  } else if (year && month) {
    rangeStart = new Date(year, month - 1, 1)
    rangeEnd = new Date(year, month, 0)
  }

  if (rangeStart && rangeEnd) {
    filter.$and = [
      { scheduledStartDate: { $lte: rangeEnd } },
      { scheduledEndDate: { $gte: rangeStart } },
    ]
  }
  
  const events = await GymkhanaEvent.find(filter)
    .select("title category scheduledStartDate scheduledEndDate status proposalDueDate")
    .sort({ scheduledStartDate: 1 })

  const enrichedEvents = events.map(enrichEventWithProposalDueDate)
  
  sendRawResponse(res, success({ events: enrichedEvents }))
})
