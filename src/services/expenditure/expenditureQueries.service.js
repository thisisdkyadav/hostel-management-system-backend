/**
 * Expenditure Queries Service
 * ---------------------------
 * The single READ surface for the Student-Affairs expenditure collection
 * (ExpenditureOccurrence). The app service reads through these instead of
 * importing the model, so it is touched only inside `src/services/expenditure/`
 * (writes live in expenditureOwner.service.js).
 */

import { ExpenditureOccurrence } from "../../models/index.js"

const OCCURRENCE_POPULATE = [
  ["createdBy", "name email role"],
  ["updatedBy", "name email role"],
]
const applyPopulate = (q) =>
  OCCURRENCE_POPULATE.reduce((acc, [path, select]) => acc.populate(path, select), q)

export const expenditureQueries = {
  /**
   * Occurrence list (filtered), newest first, populated + lean. The heavy
   * embedded arrays are excluded — the list only needs headline fields; totals
   * come from aggregateTotals().
   */
  async listOccurrences(query = {}) {
    return applyPopulate(
      ExpenditureOccurrence.find(query)
        .sort({ createdAt: -1 })
        .select("-expenses -payments -documents")
    ).lean()
  },

  /** Budget/expense/payment totals + entry counts per occurrence -> [{ _id, ... }]. */
  async aggregateTotals(query = {}) {
    return ExpenditureOccurrence.aggregate([
      { $match: query },
      {
        $project: {
          expenseTotal: { $sum: "$expenses.amount" },
          paymentTotal: { $sum: "$payments.amount" },
          expenseCount: { $size: { $ifNull: ["$expenses", []] } },
          paymentCount: { $size: { $ifNull: ["$payments", []] } },
          documentCount: { $size: { $ifNull: ["$documents", []] } },
        },
      },
    ])
  },

  /** One occurrence, populated + lean (detail / post-write refetch). */
  async findOccurrenceByIdPopulated(id) {
    return applyPopulate(ExpenditureOccurrence.findById(id)).lean()
  },

  /** One occurrence, hydrated (mutate-then-persist). */
  async findOccurrenceById(id) {
    return ExpenditureOccurrence.findById(id)
  },
}

export default expenditureQueries
