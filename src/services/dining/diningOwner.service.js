/**
 * Dining Owner Service
 * --------------------
 * The single WRITE surface for the dining "core" collections not already owned by
 * the allocation/billing services: Caterer, DiningOfficeStaff, and (added
 * incrementally) DiningPeriod / DiningRebate / DiningMealVerification. Reads live
 * in diningQueries.service.js.
 */

import { Caterer, DiningOfficeStaff, DiningPeriod, DiningMealVerification } from "../../models/index.js"

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

  // ---- DiningMealVerification ----

  /** Create a meal-verification record. */
  async createVerification(data) {
    return DiningMealVerification.create(data)
  },
}

export default diningOwner
