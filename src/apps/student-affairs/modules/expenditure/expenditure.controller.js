import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { expenditureService } from "./expenditure.service.js"

// ---- Occurrence ----
export const listOccurrences = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.listOccurrences(req.query))
})

export const getOccurrence = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.getOccurrence(req.params.id))
})

export const createOccurrence = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.createOccurrence(req.body, req.user))
})

export const updateOccurrence = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.updateOccurrence(req.params.id, req.body, req.user))
})

export const deleteOccurrence = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.deleteOccurrence(req.params.id))
})

// ---- Expenses ----
export const addExpense = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.addExpense(req.params.id, req.body, req.user))
})

export const updateExpense = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.updateExpense(req.params.id, req.params.expenseId, req.body, req.user))
})

export const deleteExpense = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.deleteExpense(req.params.id, req.params.expenseId, req.user))
})

// ---- Bills (nested under an expense) ----
export const addBill = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.addBill(req.params.id, req.params.expenseId, req.body, req.user))
})

export const updateBill = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.updateBill(req.params.id, req.params.expenseId, req.params.billId, req.body, req.user))
})

export const deleteBill = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.deleteBill(req.params.id, req.params.expenseId, req.params.billId, req.user))
})

// ---- Payments ----
export const addPayment = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.addPayment(req.params.id, req.body, req.user))
})

export const updatePayment = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.updatePayment(req.params.id, req.params.paymentId, req.body, req.user))
})

export const deletePayment = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.deletePayment(req.params.id, req.params.paymentId, req.user))
})

// ---- Occurrence-level documents ----
export const addDocuments = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.addDocuments(req.params.id, req.body.attachments, req.user))
})

export const deleteDocument = asyncHandler(async (req, res) => {
  sendStandardResponse(res, await expenditureService.deleteDocument(req.params.id, req.params.documentId, req.user))
})

export default {
  listOccurrences,
  getOccurrence,
  createOccurrence,
  updateOccurrence,
  deleteOccurrence,
  addExpense,
  updateExpense,
  deleteExpense,
  addBill,
  updateBill,
  deleteBill,
  addPayment,
  updatePayment,
  deletePayment,
  addDocuments,
  deleteDocument,
}
