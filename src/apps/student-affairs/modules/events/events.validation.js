/**
 * @fileoverview Events Module Validation
 * @description Joi validation schemas for events management
 */

import Joi from "joi"
import { objectId } from "../../../../validations/common.validation.js"
import { EVENT_CATEGORY } from "./events.constants.js"

// ═══════════════════════════════════════════════════════════════════════════════
// COMMON SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

const calendarEventSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  category: Joi.string().valid(...Object.values(EVENT_CATEGORY)).required(),
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  estimatedBudget: Joi.number().min(0).required(),
  description: Joi.string().trim().min(10).max(3000).required(),
}).custom((value, helpers) => {
  if (new Date(value.endDate) < new Date(value.startDate)) {
    return helpers.message("End date cannot be before start date")
  }
  return value
})

const billSchema = Joi.object({
  description: Joi.string().trim().max(500).required(),
  amount: Joi.number().min(0).required(),
  billNumber: Joi.string().trim().max(100),
  billDate: Joi.date(),
  vendor: Joi.string().trim().max(200),
  attachments: Joi.array()
    .items(
      Joi.object({
        filename: Joi.string().trim().max(255).required(),
        url: Joi.string().trim().max(4000).required(),
      })
    )
    .min(1)
    .required(),
})

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY CALENDAR SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const createCalendarSchema = Joi.object({
  academicYear: Joi.string().pattern(/^\d{4}-\d{2}$/).required()
    .messages({ "string.pattern.base": "Academic year must be in format YYYY-YY (e.g., 2025-26)" }),
  events: Joi.array().items(calendarEventSchema).default([]),
})

export const updateCalendarSchema = Joi.object({
  events: Joi.array().items(calendarEventSchema).min(1),
}).min(1)

export const calendarIdSchema = Joi.object({
  id: objectId.required(),
})

export const calendarYearSchema = Joi.object({
  year: Joi.string().pattern(/^\d{4}-\d{2}$/).required(),
})

export const approvalActionSchema = Joi.object({
  comments: Joi.string().trim().max(1000),
})

export const submitCalendarSchema = Joi.object({
  allowOverlappingDates: Joi.boolean().default(false),
})

export const rejectionSchema = Joi.object({
  reason: Joi.string().trim().min(10).max(1000).required(),
})

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT PROPOSAL SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const createProposalSchema = Joi.object({
  proposalText: Joi.string().trim().min(10).max(5000).required(),
  proposalDocumentUrl: Joi.string().trim().allow("").max(4000),
  externalGuestsDetails: Joi.string().trim().allow("").max(3000),
  chiefGuestDocumentUrl: Joi.string().trim().allow("").max(4000),
  accommodationRequired: Joi.boolean().default(false),
  hasRegistrationFee: Joi.boolean().default(false),
  registrationFeeAmount: Joi.when("hasRegistrationFee", {
    is: true,
    then: Joi.number().min(0).required(),
    otherwise: Joi.number().min(0).default(0),
  }),
  totalExpectedIncome: Joi.number().min(0).required(),
  totalExpenditure: Joi.number().min(0).required(),
})

export const updateProposalSchema = Joi.object({
  proposalText: Joi.string().trim().min(10).max(5000),
  proposalDocumentUrl: Joi.string().trim().allow("").max(4000),
  externalGuestsDetails: Joi.string().trim().allow("").max(3000),
  chiefGuestDocumentUrl: Joi.string().trim().allow("").max(4000),
  accommodationRequired: Joi.boolean(),
  hasRegistrationFee: Joi.boolean(),
  registrationFeeAmount: Joi.number().min(0),
  totalExpectedIncome: Joi.number().min(0),
  totalExpenditure: Joi.number().min(0),
}).min(1)

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const createExpenseSchema = Joi.object({
  bills: Joi.array().items(billSchema).min(1).required(),
  eventReportDocumentUrl: Joi.string().trim().max(4000).required(),
  notes: Joi.string().trim().max(1000),
})

export const updateExpenseSchema = Joi.object({
  bills: Joi.array().items(billSchema).min(1),
  eventReportDocumentUrl: Joi.string().trim().allow("").max(4000),
  notes: Joi.string().trim().max(1000),
}).min(1)

// ═══════════════════════════════════════════════════════════════════════════════
// AMENDMENT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const createAmendmentSchema = Joi.object({
  type: Joi.string().valid("edit", "new_event").required(),
  eventId: Joi.when("type", {
    is: "edit",
    then: objectId.required(),
    otherwise: Joi.forbidden(),
  }),
  proposedChanges: calendarEventSchema.required(),
  reason: Joi.string().trim().min(10).max(1000).required(),
})

export const reviewAmendmentSchema = Joi.object({
  reviewComments: Joi.string().trim().max(1000),
})

export const checkOverlapSchema = Joi.object({
  startDate: Joi.date().required(),
  endDate: Joi.date().required(),
  eventId: Joi.alternatives().try(objectId, Joi.valid(null), Joi.string().allow("")).optional(),
}).custom((value, helpers) => {
  if (new Date(value.endDate) < new Date(value.startDate)) {
    return helpers.message("End date cannot be before start date")
  }
  return value
})

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const calendarQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string(),
  academicYear: Joi.string().pattern(/^\d{4}-\d{2}$/),
})

export const eventsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string(),
  category: Joi.string().valid(...Object.values(EVENT_CATEGORY)),
  calendarId: objectId,
  proposalSubmitted: Joi.boolean(),
})

export const pendingProposalsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  daysUntilDue: Joi.number().min(0).max(60),
})
