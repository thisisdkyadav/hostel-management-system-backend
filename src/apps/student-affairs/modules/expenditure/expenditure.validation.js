import Joi from "joi"
import { objectId, mediaReference } from "../../../../validations/common.validation.js"
import { EXPENDITURE_STATUS, MAX_ATTACHMENTS } from "./expenditure.constants.js"

// ---- shared building blocks ----
const money = Joi.number().min(0)
const text = (max) => Joi.string().trim().max(max).allow("")

const attachment = Joi.object({
  fileRef: mediaReference.required(),
  originalName: text(300).default(""),
  contentType: text(150).default(""),
  size: Joi.number().min(0).default(0),
})
const attachments = Joi.array().items(attachment).max(MAX_ATTACHMENTS).default([])

// ---- Occurrence ----
export const createOccurrenceSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  description: text(2000).default(""),
  totalBudget: money.default(0),
})

export const updateOccurrenceSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  description: text(2000),
  totalBudget: money,
  status: Joi.string().valid(EXPENDITURE_STATUS.OPEN, EXPENDITURE_STATUS.CLOSED),
}).min(1)

// ---- Expense ----
export const createExpenseSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  category: text(100).default(""),
  amount: money.required(),
  incurredAt: Joi.date().iso().allow(null),
  notes: text(2000).default(""),
  attachments,
})

export const updateExpenseSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  category: text(100),
  amount: money,
  incurredAt: Joi.date().iso().allow(null),
  notes: text(2000),
  attachments,
}).min(1)

// ---- Bill (nested under an expense) ----
export const createBillSchema = Joi.object({
  vendor: text(200).default(""),
  billNumber: text(100).default(""),
  amount: money.default(0),
  billedAt: Joi.date().iso().allow(null),
  notes: text(2000).default(""),
  attachments,
})

export const updateBillSchema = Joi.object({
  vendor: text(200),
  billNumber: text(100),
  amount: money,
  billedAt: Joi.date().iso().allow(null),
  notes: text(2000),
  attachments,
}).min(1)

// ---- Payment ----
export const createPaymentSchema = Joi.object({
  source: text(200).default(""),
  amount: money.required(),
  method: text(100).default(""),
  receivedAt: Joi.date().iso().allow(null),
  reference: text(200).default(""),
  notes: text(2000).default(""),
  attachments,
})

export const updatePaymentSchema = Joi.object({
  source: text(200),
  amount: money,
  method: text(100),
  receivedAt: Joi.date().iso().allow(null),
  reference: text(200),
  notes: text(2000),
  attachments,
}).min(1)

// ---- Occurrence-level documents ----
export const addDocumentsSchema = Joi.object({
  attachments: Joi.array().items(attachment).min(1).max(MAX_ATTACHMENTS).required(),
})

// ---- params / query ----
export const occurrenceIdSchema = Joi.object({ id: objectId.required() })
export const expenseParamsSchema = Joi.object({
  id: objectId.required(),
  expenseId: objectId.required(),
})
export const billParamsSchema = Joi.object({
  id: objectId.required(),
  expenseId: objectId.required(),
  billId: objectId.required(),
})
export const paymentParamsSchema = Joi.object({
  id: objectId.required(),
  paymentId: objectId.required(),
})
export const documentParamsSchema = Joi.object({
  id: objectId.required(),
  documentId: objectId.required(),
})

export const listQuerySchema = Joi.object({
  status: Joi.string().valid(EXPENDITURE_STATUS.OPEN, EXPENDITURE_STATUS.CLOSED),
  search: Joi.string().trim().max(200).allow(""),
})

export default {
  createOccurrenceSchema,
  updateOccurrenceSchema,
  createExpenseSchema,
  updateExpenseSchema,
  createBillSchema,
  updateBillSchema,
  createPaymentSchema,
  updatePaymentSchema,
  addDocumentsSchema,
  occurrenceIdSchema,
  expenseParamsSchema,
  billParamsSchema,
  paymentParamsSchema,
  documentParamsSchema,
  listQuerySchema,
}
