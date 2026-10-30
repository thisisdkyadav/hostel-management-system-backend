/**
 * Dining Owner Service
 * --------------------
 * The single WRITE surface for the dining "core" collections not already owned by
 * the allocation/billing services: Caterer, DiningOfficeStaff, and (added
 * incrementally) DiningPeriod / DiningRebate / DiningMealVerification. Reads live
 * in diningQueries.service.js.
 */

import { Caterer, DiningOfficeStaff, DiningPeriod, DiningMealVerification, DiningRebate } from "../../models/index.js"
import { periodDay } from "./periodDay.js"

export const diningOwner = {
  // ---- Caterer ----

  /** Create a caterer (equivalent to `new Caterer(data).save()`). */
  async createCaterer(data) {
    return Caterer.create(data)
  },

  /** Persist a hydrated caterer doc (mutate-then-save: update name/email). */
  async persistCaterer(doc) {
    return doc.save()
  },

  /** findByIdAndUpdate a caterer (options e.g. { new: true }). Returns doc or null. */
  async updateCatererById(id, updates, options = {}) {
    return Caterer.findByIdAndUpdate(id, updates, options)
  },

  // ---- DiningOfficeStaff ----

  /** Create an office-staff profile. */
  async createOfficeStaff(data) {
    return DiningOfficeStaff.create(data)
  },

  /** findByIdAndUpdate an office-staff profile (options default none). */
  async updateOfficeStaffById(id, updates, options = {}) {
    return DiningOfficeStaff.findByIdAndUpdate(id, updates, options)
  },

  /** Delete an office-staff profile by id. Returns the deleted doc or null. */
  async deleteOfficeStaffById(id) {
    return DiningOfficeStaff.findByIdAndDelete(id)
  },

  // ---- DiningPeriod ----

  /** Create a dining period (equivalent to `new DiningPeriod(data).save()`). */
  async createPeriod(data) {
    return DiningPeriod.create(data)
  },

  /**
   * findByIdAndUpdate a dining period. Mongoose options ({ new, runValidators })
   * pass through; { populate, lean } are applied as query modifiers on the
   * returned doc. Returns doc or null.
   */
  async updatePeriodById(id, updates, { populate, lean, ...options } = {}) {
    let query = DiningPeriod.findByIdAndUpdate(id, updates, options)
    if (populate) query = query.populate(populate)
    if (lean) query = query.lean()
    return query
  },

  /**
   * Atomically claim one period whose registration notification is due
   * (sets notificationSentAt). Safe across instances: only one claimer wins.
   */
  async claimDueNotificationPeriod(now = new Date()) {
    return DiningPeriod.findOneAndUpdate(
      {
        notificationAt: { $ne: null, $lte: now },
        notificationSentAt: null,
        isArchived: false,
        registrationEnabled: { $ne: false },
      },
      { $set: { notificationSentAt: now } },
      { new: true, sort: { notificationAt: 1 } }
    ).lean()
  },

  /**
   * Atomically claim one period whose scheduled auto-allocation is due: marks
   * autoAllocation.status 'running' so only one instance/call ever runs it.
   * Never matches a period that already ran (status set), is archived, has no
   * autoAllocationAt, or whose service dates have already ended.
   */
  async claimDueAutoAllocationPeriod(now = new Date()) {
    return DiningPeriod.findOneAndUpdate(
      {
        isArchived: false,
        autoAllocationAt: { $ne: null, $lte: now },
        "autoAllocation.status": null,
        endDate: { $gte: periodDay(now) },
      },
      { $set: { autoAllocation: { status: "running", startedAt: now } } },
      { returnDocument: "after", sort: { autoAllocationAt: 1 } }
    ).lean()
  },

  /**
   * Record the outcome of a claimed auto-allocation run. `result` is
   * { status:'completed'|'failed', completedAt, unallocatedBefore, assigned,
   * leftOver, byCaterer:[{catererId, assigned}], error }; only provided keys are
   * written, so startedAt from the claim is preserved.
   */
  async recordAutoAllocationResult(periodId, result = {}) {
    const fields = ["status", "completedAt", "unallocatedBefore", "assigned", "leftOver", "byCaterer", "error"]
    const $set = {}
    fields.forEach((key) => {
      if (result[key] !== undefined) $set[`autoAllocation.${key}`] = result[key]
    })
    return DiningPeriod.updateOne({ _id: periodId }, { $set })
  },

  // ---- DiningMealVerification ----

  /** Create a meal-verification record. */
  async createVerification(data) {
    return DiningMealVerification.create(data)
  },

  // ---- DiningRebate ----

  /** Insert many rebate docs (mongoose insertMany: runs validators, returns hydrated docs). */
  async insertRebates(docs, options = {}) {
    return DiningRebate.insertMany(docs, options)
  },

  /** Persist a hydrated rebate doc (mutate-then-save: approve/reject). */
  async persistRebate(doc) {
    return doc.save()
  },
}

export default diningOwner
