/**
 * Dining Billing Queries Service
 * ------------------------------
 * The single READ surface for the DiningBillingPeriod + DiningBillingAccount
 * collections. Every module that reads dining-billing data calls these methods
 * instead of importing the models, so those two collections are touched only
 * inside src/services/dining/ (writes live in billingOwner.service.js). Charges
 * are derived on read by the caller's charge engine; these methods return the
 * stored docs only.
 */

import { DiningBillingAccount, DiningBillingPeriod } from "../../models/index.js"

// Contained dining periods are populated for date-range + dailyRate derivation.
const DINING_PERIODS_POPULATE = { path: "diningPeriodIds", select: "startDate endDate dailyRate" }

export const billingQueries = {
  // ==================== DiningBillingPeriod ====================

  /** Billing periods (archived or not) with contained dining periods populated. */
  async findBillingPeriods(archive) {
    return DiningBillingPeriod.find({ isArchived: archive === "true" })
      .populate(DINING_PERIODS_POPULATE)
      .sort({ createdAt: -1 })
      .lean()
  },

  /** One billing period by id (contained dining periods populated unless opted out). */
  async findBillingPeriodById(billingPeriodId, { populate = true } = {}) {
    const query = DiningBillingPeriod.findById(billingPeriodId)
    if (populate) query.populate(DINING_PERIODS_POPULATE)
    return query.lean()
  },

  /** _ids of active billing periods that contain any of the given dining periods. */
  async findActiveBillingPeriodIdsByDiningPeriods(diningPeriodIds) {
    return DiningBillingPeriod.find({ isArchived: false, diningPeriodIds: { $in: diningPeriodIds } })
      .select("_id")
      .lean()
  },

  /** Active billing periods by id (populated) — student billing overview. */
  async findActiveBillingPeriodsByIds(ids) {
    return DiningBillingPeriod.find({ _id: { $in: ids }, isArchived: false })
      .populate(DINING_PERIODS_POPULATE)
      .lean()
  },

  // ==================== DiningBillingAccount ====================

  /** All pot accounts for a billing period. */
  async findAccountsByPeriod(billingPeriodId) {
    return DiningBillingAccount.find({ billingPeriodId }).lean()
  },

  /** One student's pot account for a billing period. */
  async findAccountByPeriodAndUser(billingPeriodId, studentUserId) {
    return DiningBillingAccount.findOne({ billingPeriodId, studentUserId }).lean()
  },

  /** The billingPeriodIds a student has a pot account in. */
  async findAccountBillingPeriodIdsByUser(studentUserId) {
    return DiningBillingAccount.find({ studentUserId }).select("billingPeriodId").lean()
  },
}

export default billingQueries
