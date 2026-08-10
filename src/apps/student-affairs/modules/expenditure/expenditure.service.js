/**
 * Expenditure Service
 * Student Affairs expenditure occurrences: total budget, expenses (each with
 * bills), payments received, and supporting documents. Every entry can carry
 * multiple PDF/image attachments (stored as storage-backend fileRefs).
 * @module apps/student-affairs/modules/expenditure
 */

import { success, notFound } from "../../../../services/base/index.js"
import { expenditureOwner } from "../../../../services/expenditure/expenditureOwner.service.js"
import { expenditureQueries } from "../../../../services/expenditure/expenditureQueries.service.js"

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

class ExpenditureService {
  /** Sum-derived figures for an occurrence (never stored; computed on read). */
  computeTotals(occ = {}) {
    const expenses = occ.expenses || []
    const payments = occ.payments || []
    const expenseTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const paymentTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const billTotal = expenses.reduce(
      (s, e) => s + (e.bills || []).reduce((bs, b) => bs + (Number(b.amount) || 0), 0),
      0
    )
    const totalBudget = Number(occ.totalBudget) || 0
    return {
      totalBudget,
      expenseTotal,
      paymentTotal,
      billTotal,
      remainingBudget: totalBudget - expenseTotal,
      netBalance: paymentTotal - expenseTotal,
      expenseCount: expenses.length,
      paymentCount: payments.length,
      documentCount: (occ.documents || []).length,
    }
  }

  /** Refetch the populated occurrence and wrap it (with totals) in a response. */
  async respondWithOccurrence(id, statusCode, message) {
    const occurrence = await expenditureQueries.findOccurrenceByIdPopulated(id)
    return success({ occurrence, totals: this.computeTotals(occurrence) }, statusCode, message)
  }

  /** Copy the provided fields (undefined = untouched) onto a subdocument. */
  applyFields(target, data, fields) {
    for (const field of fields) {
      if (data[field] !== undefined) target[field] = data[field]
    }
  }

  // ==================== Occurrence ====================

  async listOccurrences({ status, search } = {}) {
    const query = {}
    if (status) query.status = status
    if (search) query.title = { $regex: escapeRegex(search), $options: "i" }

    const [occurrences, totals] = await Promise.all([
      expenditureQueries.listOccurrences(query),
      expenditureQueries.aggregateTotals(query),
    ])
    const totalsById = new Map(totals.map((t) => [String(t._id), t]))

    const items = occurrences.map((o) => {
      const t = totalsById.get(String(o._id)) || {}
      const totalBudget = Number(o.totalBudget) || 0
      const expenseTotal = t.expenseTotal || 0
      return {
        ...o,
        expenseTotal,
        paymentTotal: t.paymentTotal || 0,
        remainingBudget: totalBudget - expenseTotal,
        expenseCount: t.expenseCount || 0,
        paymentCount: t.paymentCount || 0,
        documentCount: t.documentCount || 0,
      }
    })

    return success({ occurrences: items })
  }

  async getOccurrence(id) {
    const occurrence = await expenditureQueries.findOccurrenceByIdPopulated(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    return success({ occurrence, totals: this.computeTotals(occurrence) })
  }

  async createOccurrence(data, user) {
    const occurrence = await expenditureOwner.createOccurrence({
      title: data.title,
      description: data.description || "",
      totalBudget: data.totalBudget || 0,
      createdBy: user._id,
    })
    return this.respondWithOccurrence(occurrence._id, 201, "Expenditure occurrence created")
  }

  async updateOccurrence(id, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")

    if (data.title !== undefined) occurrence.title = data.title
    if (data.description !== undefined) occurrence.description = data.description
    if (data.totalBudget !== undefined) occurrence.totalBudget = data.totalBudget
    if (data.status !== undefined) occurrence.status = data.status
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Expenditure occurrence updated")
  }

  async deleteOccurrence(id) {
    const deleted = await expenditureOwner.deleteOccurrenceById(id)
    if (!deleted) return notFound("Expenditure occurrence")
    return success(null, 200, "Expenditure occurrence deleted")
  }

  // ==================== Expenses ====================

  async addExpense(id, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")

    occurrence.expenses.push({
      title: data.title,
      category: data.category || "",
      amount: data.amount,
      incurredAt: data.incurredAt || undefined,
      notes: data.notes || "",
      attachments: data.attachments || [],
    })
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 201, "Expense added")
  }

  async updateExpense(id, expenseId, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    const expense = occurrence.expenses.id(expenseId)
    if (!expense) return notFound("Expense")

    this.applyFields(expense, data, ["title", "category", "amount", "notes", "attachments"])
    if (data.incurredAt !== undefined) expense.incurredAt = data.incurredAt || undefined
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Expense updated")
  }

  async deleteExpense(id, expenseId, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    if (!occurrence.expenses.id(expenseId)) return notFound("Expense")

    occurrence.expenses.pull(expenseId)
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Expense removed")
  }

  // ==================== Bills (nested under an expense) ====================

  async addBill(id, expenseId, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    const expense = occurrence.expenses.id(expenseId)
    if (!expense) return notFound("Expense")

    expense.bills.push({
      vendor: data.vendor || "",
      billNumber: data.billNumber || "",
      amount: data.amount || 0,
      billedAt: data.billedAt || undefined,
      notes: data.notes || "",
      attachments: data.attachments || [],
    })
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 201, "Bill added")
  }

  async updateBill(id, expenseId, billId, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    const expense = occurrence.expenses.id(expenseId)
    if (!expense) return notFound("Expense")
    const bill = expense.bills.id(billId)
    if (!bill) return notFound("Bill")

    this.applyFields(bill, data, ["vendor", "billNumber", "amount", "notes", "attachments"])
    if (data.billedAt !== undefined) bill.billedAt = data.billedAt || undefined
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Bill updated")
  }

  async deleteBill(id, expenseId, billId, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    const expense = occurrence.expenses.id(expenseId)
    if (!expense) return notFound("Expense")
    if (!expense.bills.id(billId)) return notFound("Bill")

    expense.bills.pull(billId)
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Bill removed")
  }

  // ==================== Payments ====================

  async addPayment(id, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")

    occurrence.payments.push({
      source: data.source || "",
      amount: data.amount,
      method: data.method || "",
      receivedAt: data.receivedAt || undefined,
      reference: data.reference || "",
      notes: data.notes || "",
      attachments: data.attachments || [],
    })
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 201, "Payment added")
  }

  async updatePayment(id, paymentId, data, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    const payment = occurrence.payments.id(paymentId)
    if (!payment) return notFound("Payment")

    this.applyFields(payment, data, ["source", "amount", "method", "reference", "notes", "attachments"])
    if (data.receivedAt !== undefined) payment.receivedAt = data.receivedAt || undefined
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Payment updated")
  }

  async deletePayment(id, paymentId, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    if (!occurrence.payments.id(paymentId)) return notFound("Payment")

    occurrence.payments.pull(paymentId)
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Payment removed")
  }

  // ==================== Occurrence-level documents ====================

  async addDocuments(id, attachments, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")

    occurrence.documents.push(...(attachments || []))
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 201, "Documents added")
  }

  async deleteDocument(id, documentId, user) {
    const occurrence = await expenditureQueries.findOccurrenceById(id)
    if (!occurrence) return notFound("Expenditure occurrence")
    if (!occurrence.documents.id(documentId)) return notFound("Document")

    occurrence.documents.pull(documentId)
    occurrence.updatedBy = user._id

    await expenditureOwner.persistOccurrence(occurrence)
    return this.respondWithOccurrence(id, 200, "Document removed")
  }
}

export const expenditureService = new ExpenditureService()
export default expenditureService
