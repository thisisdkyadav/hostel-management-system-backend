/**
 * Dining Billing Owner Service
 * ----------------------------
 * The single owner of all WRITES to DiningBillingPeriod + DiningBillingAccount.
 * Every module that changes a billing period or a student's fund pot goes through
 * these operations instead of touching the models directly.
 *
 * The important one is applyFundAdjustment: the legacy bulk-fund path did a
 * read-modify-write (findOne -> account.allocatedAmount = next -> save), so two
 * concurrent add/deduct operations on the same account both read the same base
 * and one save was lost — silently losing money. This applies the adjustment as
 * a single ATOMIC upsert: an aggregation-pipeline update that computes the new
 * allocatedAmount AND appends the adjustment log entry (with allocatedAfter read
 * from the just-updated value) in one operation, so concurrent increments compose
 * instead of clobbering.
 *
 * Pipeline-array updates require `{ updatePipeline: true }` on Mongoose 9.
 */

import mongoose from "mongoose"
import { DiningBillingAccount, DiningBillingPeriod } from "../../models/index.js"

const DINING_PERIODS_POPULATE = { path: "diningPeriodIds", select: "startDate endDate dailyRate" }
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100
const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value)

export const billingOwner = {
  // ==================== DiningBillingPeriod ====================

  /** Create a billing period; returns it with contained dining periods populated. */
  async createBillingPeriod(data) {
    const created = await new DiningBillingPeriod(data).save()
    return DiningBillingPeriod.findById(created._id).populate(DINING_PERIODS_POPULATE).lean()
  },

  /** Update a billing period's editable fields; returns the populated doc or null. */
  async updateBillingPeriod(billingPeriodId, data) {
    return DiningBillingPeriod.findByIdAndUpdate(billingPeriodId, data, {
      new: true,
      runValidators: true,
    })
      .populate(DINING_PERIODS_POPULATE)
      .lean()
  },

  /** Toggle a billing period's archived flag; returns the populated doc or null. */
  async setBillingPeriodArchived(billingPeriodId, isArchived) {
    return DiningBillingPeriod.findByIdAndUpdate(
      billingPeriodId,
      { isArchived: Boolean(isArchived) },
      { new: true }
    )
      .populate(DINING_PERIODS_POPULATE)
      .lean()
  },

  // ==================== DiningBillingAccount ====================

  /**
   * Atomically apply one fund adjustment to a student's pot for a billing period.
   * mode: 'add' | 'deduct' | 'set'. Race-safe (no read-modify-write); upserts the
   * account if it doesn't exist. Returns the updated account doc.
   */
  async applyFundAdjustment({
    billingPeriodId,
    studentUserId,
    studentProfileId,
    rollNumber,
    mode,
    amount,
    performedBy,
  }) {
    const amt = round2(amount)
    const now = new Date()

    let allocatedExpr
    if (mode === "add") {
      allocatedExpr = { $round: [{ $add: [{ $ifNull: ["$allocatedAmount", 0] }, amt] }, 2] }
    } else if (mode === "deduct") {
      allocatedExpr = { $round: [{ $subtract: [{ $ifNull: ["$allocatedAmount", 0] }, amt] }, 2] }
    } else {
      allocatedExpr = amt // set
    }

    // Appended to adjustments[]; allocatedAfter references the value the first
    // stage just set, so it always logs the post-adjustment balance.
    const adjustment = {
      mode,
      amount: amt,
      allocatedAfter: "$allocatedAmount",
      note: "",
      performedBy: performedBy ? toObjectId(performedBy) : null,
      performedAt: now,
    }

    const pipeline = [
      {
        $set: {
          allocatedAmount: allocatedExpr,
          studentProfileId: studentProfileId ? toObjectId(studentProfileId) : null,
          rollNumber,
          updatedAt: now,
          createdAt: { $ifNull: ["$createdAt", now] },
        },
      },
      {
        $set: {
          adjustments: { $concatArrays: [{ $ifNull: ["$adjustments", []] }, [adjustment]] },
        },
      },
    ]

    const filter = {
      billingPeriodId: toObjectId(billingPeriodId),
      studentUserId: toObjectId(studentUserId),
    }

    // Concurrent first-time upserts race on the unique (billingPeriodId,
    // studentUserId) index; the loser retries and updates the now-existing doc.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await DiningBillingAccount.findOneAndUpdate(filter, pipeline, {
          new: true,
          upsert: true,
          updatePipeline: true,
        })
      } catch (err) {
        if (err?.code === 11000 && attempt === 0) continue
        throw err
      }
    }
    return null
  },
}

export default billingOwner
