/**
 * Event Expense Queries Service
 * -----------------------------
 * The single READ surface for the EventExpense collection. The expense
 * app-service reads through these instead of importing the model, so
 * EventExpense is touched only inside `src/services/gymkhana/` (writes live in
 * eventExpenseOwner.service.js).
 *
 * SOFT DELETE: the model has a pre(/^find/) guard that hides isDeleted docs
 * unless the filter names `isDeleted` or the query sets { withDeleted: true }.
 * These methods preserve that exactly — bare finds hide deleted;
 * findExpenseByIdWithDeleted opts in via setOptions; listDeletedExpenses
 * filters on isDeleted. populate/lean choices mirror each caller EXACTLY.
 */

import { EventExpense } from "../../models/index.js"

export const eventExpenseQueries = {
  /** Expense by id (hydrated; hides soft-deleted — mutate-then-persist + reads). */
  async findExpenseById(id) {
    return EventExpense.findById(id)
  },

  /** Expense for an event (bare; hides soft-deleted — existence check on submit). */
  async findExpenseByEventId(eventId) {
    return EventExpense.findOne({ eventId })
  },

  /** Expense by id INCLUDING soft-deleted (admin restore). */
  async findExpenseByIdWithDeleted(id) {
    return EventExpense.findOne({ _id: id }).setOptions({ withDeleted: true })
  },

  /** Any OTHER active (non-deleted) expense for an event (restore conflict check). */
  async findActiveExpenseByEventExcluding(eventId, excludeId) {
    return EventExpense.findOne({ eventId, _id: { $ne: excludeId } })
  },

  /** Expense by id with event + actor refs populated (detail view). */
  async findExpenseByIdDetailed(id) {
    return EventExpense.findById(id)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")
  },

  /** Expense for an event, populated (get-by-event). */
  async findExpenseByEventPopulated(eventId) {
    return EventExpense.findOne({ eventId })
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")
  },

  /** Soft-deleted expenses, newest-deleted first (admin deleted-items view). */
  async listDeletedExpenses({ limit = 200 } = {}) {
    return EventExpense.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(limit)
      .populate("submittedBy", "name email")
      .populate("deletedBy", "name email")
      .populate("eventId", "title category")
      .lean()
  },

  /** Paginated expenses with event/actor refs, newest first (admin list). */
  async listExpenses(filter = {}, { skip = 0, limit = 10 } = {}) {
    return EventExpense.find(filter)
      .populate("eventId", "title category scheduledStartDate scheduledEndDate")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
  },

  /** Count expenses matching a filter (admin-list pagination). */
  async countExpenses(filter = {}) {
    return EventExpense.countDocuments(filter)
  },
}

export default eventExpenseQueries
