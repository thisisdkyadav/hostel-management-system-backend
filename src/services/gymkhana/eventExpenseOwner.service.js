/**
 * Event Expense Owner Service
 * ---------------------------
 * The single WRITE surface for the EventExpense collection (post-event billing
 * submitted by GS). Every create/persist goes through here so the model is
 * mutated only inside `src/services/gymkhana/` (reads live in
 * eventExpenseQueries.service.js).
 *
 * Expenses are fetched hydrated by the caller, mutated in place, then persisted
 * via persistExpense, which runs the pre-save hook (totalExpenditure +
 * budgetVariance) and includes soft-delete flag changes.
 */

import { EventExpense } from "../../models/index.js"

export const eventExpenseOwner = {
  /** Create an expense. Returns the created doc (pre-save totals hook runs). */
  async createExpense(data) {
    return EventExpense.create(data)
  },

  /** Persist a hydrated expense doc mutated by the caller (pre-save totals hook runs). */
  async persistExpense(expense) {
    return expense.save()
  },
}

export default eventExpenseOwner
