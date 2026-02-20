/**
 * @fileoverview Events Controller
 * @description HTTP handlers for all events operations
 */

import { asyncHandler, sendRawResponse } from "../../../../utils/controllerHelpers.js"
import { calendarService } from "./calendar.service.js"
import { proposalService } from "./proposal.service.js"
import { expenseService } from "./expense.service.js"
import { amendmentService } from "./amendment.service.js"
import { megaEventsService } from "./mega-events.service.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import { success } from "../../../../services/base/ServiceResponse.js"
import { getConfigWithDefault } from "../../../../utils/configDefaults.js"

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

const ACADEMIC_HOLIDAYS_KEY = "academicHolidays"
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

const parseDateOrNull = (value) => {
  if (typeof value === "string" && DATE_ONLY_REGEX.test(value)) {
    const [year, month, day] = value.split("-").map((part) => parseInt(part, 10))
    return new Date(year, month - 1, day)
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const dayStart = (value) => {
  const date = parseDateOrNull(value)
  if (!date) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
}

const dayEnd = (value) => {
  const date = parseDateOrNull(value)
  if (!date) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

const formatDateOnly = (value) => {
  const date = parseDateOrNull(value)
  if (!date) return null
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const getHolidaysInRange = async (rangeStart = null, rangeEnd = null) => {
  const config = await getConfigWithDefault(ACADEMIC_HOLIDAYS_KEY)
  const holidayMap = config?.value

  if (!holidayMap || typeof holidayMap !== "object" || Array.isArray(holidayMap)) {
    return []
  }

  const holidays = []
  for (const [year, entries] of Object.entries(holidayMap)) {
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      const holidayDayStart = dayStart(entry?.date)
      const holidayDayEnd = dayEnd(entry?.date)
      if (!holidayDayStart || !holidayDayEnd) continue

      if (rangeStart && rangeEnd) {
        if (holidayDayEnd < rangeStart || holidayDayStart > rangeEnd) {
          continue
        }
      }

      const normalizedDate = formatDateOnly(entry?.date)
      if (!normalizedDate) continue

      holidays.push({
        year,
        title: String(entry?.title || "").trim(),
        date: normalizedDate,
      })
    }
  }

  holidays.sort((a, b) => {
    if (a.date === b.date) return a.title.localeCompare(b.title)
    return a.date.localeCompare(b.date)
  })

  return holidays
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

export const getGymkhanaDashboardSummary = asyncHandler(async (req, res) => {
  const parsedDaysUntilDue = Number.parseInt(req.query?.daysUntilDue, 10)
  const daysUntilDue = Number.isFinite(parsedDaysUntilDue) && parsedDaysUntilDue > 0
    ? parsedDaysUntilDue
    : 21

  const [yearsResult, pendingResult] = await Promise.all([
    calendarService.getAcademicYears(),
    proposalService.getPendingProposals(daysUntilDue),
  ])

  if (!yearsResult.success) {
    return sendRawResponse(res, yearsResult)
  }

  if (!pendingResult.success) {
    return sendRawResponse(res, pendingResult)
  }

  const years = yearsResult?.data?.years || []
  const pendingProposals = pendingResult?.data?.events || []
  const latestAcademicYear = years[0]?.academicYear
  let currentCalendar = null

  if (latestAcademicYear) {
    const calendarResult = await calendarService.getCalendarByYear(latestAcademicYear)
    if (calendarResult.success) {
      currentCalendar = calendarResult?.data?.calendar || null
    } else if (calendarResult.statusCode !== 404) {
      return sendRawResponse(res, calendarResult)
    }
  }

  return sendRawResponse(
    res,
    success({
      years,
      pendingProposals,
      pendingProposalsCount: pendingProposals.length,
      currentCalendar,
      totalEvents: Array.isArray(currentCalendar?.events) ? currentCalendar.events.length : 0,
    })
  )
})

export const getGymkhanaProfile = asyncHandler(async (req, res) => {
  return sendRawResponse(
    res,
    success({
      profile: req.user,
    })
  )
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
// MEGA EVENTS CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const getMegaSeries = asyncHandler(async (req, res) => {
  const result = await megaEventsService.getSeries()
  sendRawResponse(res, result)
})

export const createMegaSeries = asyncHandler(async (req, res) => {
  const result = await megaEventsService.createSeries(req.body, req.user)
  sendRawResponse(res, result)
})

export const getMegaSeriesById = asyncHandler(async (req, res) => {
  const result = await megaEventsService.getSeriesById(req.params.seriesId)
  sendRawResponse(res, result)
})

export const createMegaOccurrence = asyncHandler(async (req, res) => {
  const result = await megaEventsService.createOccurrence(req.params.seriesId, req.body, req.user)
  sendRawResponse(res, result)
})

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const getEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, category, calendarId, megaEventSeriesId, isMegaEvent } = req.query
  
  const filter = {}
  if (status) filter.status = status
  if (category) filter.category = category
  if (calendarId) filter.calendarId = calendarId
  if (megaEventSeriesId) filter.megaEventSeriesId = megaEventSeriesId
  if (isMegaEvent !== undefined) {
    filter.isMegaEvent = String(isMegaEvent).toLowerCase() === "true"
  }
  
  const events = await GymkhanaEvent.find(filter)
    .populate("calendarId", "academicYear")
    .populate("megaEventSeriesId", "name")
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
    .populate("megaEventSeriesId", "name description")
    .populate("proposalId")
    .populate("expenseId")
  
  if (!event) {
    return sendRawResponse(res, { success: false, statusCode: 404, message: "Event not found" })
  }
  
  sendRawResponse(res, success({ event: enrichEventWithProposalDueDate(event) }))
})

export const getCalendarView = asyncHandler(async (req, res) => {
  const { year, month, startDate, endDate, isMegaEvent } = req.query
  
  const filter = {}
  if (isMegaEvent !== undefined) {
    filter.isMegaEvent = String(isMegaEvent).toLowerCase() === "true"
  } else {
    filter.isMegaEvent = false
  }
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
  const holidays = await getHolidaysInRange(rangeStart, rangeEnd)
  
  sendRawResponse(res, success({ events: enrichedEvents, holidays }))
})
