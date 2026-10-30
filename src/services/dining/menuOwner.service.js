/**
 * Dining Menu Owner Service
 * -------------------------
 * The single WRITE surface for DiningMenuWeek + DiningMenuDay (reads live in
 * menuQueries.service.js). Callers validate payloads and the editable date
 * window; this service only persists.
 *
 * - Weekly versions: upserted by (catererId, effectiveFrom); only scheduled
 *   (future) versions are ever deleted, so past days keep their menu.
 * - Date overrides: one document per (catererId, date) holding per-meal
 *   overrides. Setting a meal replaces that meal only; resetting removes it,
 *   and a document with no meals left is deleted.
 */

import mongoose from "mongoose"
import { DiningMenuWeek, DiningMenuDay } from "../../models/index.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value?._id || value))

const mealKey = (name) => String(name || "").trim().toLowerCase()

/** Run `fn(session)` in the caller's session, or in a fresh transaction. */
const inSession = async (session, fn) => {
  if (session) return fn(session)
  const own = await mongoose.startSession()
  try {
    let result
    await own.withTransaction(async () => {
      result = await fn(own)
    })
    return result
  } finally {
    await own.endSession()
  }
}

export const menuOwner = {
  // ---- DiningMenuWeek ----

  /** Create or replace the version (catererId, effectiveFrom). Returns the lean doc. */
  async upsertWeek({ catererId, effectiveFrom, days, note = "", actorId = null }, { session } = {}) {
    return DiningMenuWeek.findOneAndUpdate(
      { catererId: toObjectId(catererId), effectiveFrom },
      {
        $set: { days, note, updatedBy: actorId },
        $setOnInsert: { createdBy: actorId },
      },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true, session }
    ).lean()
  },

  /** Delete one version. Returns the number deleted (0 or 1). */
  async deleteWeek(catererId, effectiveFrom, { session } = {}) {
    const res = await DiningMenuWeek.deleteOne({ catererId: toObjectId(catererId), effectiveFrom }, { session })
    return res.deletedCount || 0
  },

  // ---- DiningMenuDay ----

  /**
   * For every date, replace the given meals' overrides (matched by name,
   * case-insensitive); other meals of that date are untouched.
   */
  async setDateMeals({ catererId, dates, meals, actorId = null }, { session } = {}) {
    const caterer = toObjectId(catererId)
    const keys = new Set(meals.map((meal) => mealKey(meal.name)))
    return inSession(session, async (txn) => {
      for (const date of dates) {
        const existing = await DiningMenuDay.findOne({ catererId: caterer, date }).session(txn).lean()
        const kept = (existing?.meals || []).filter((meal) => !keys.has(mealKey(meal.name)))
        await DiningMenuDay.updateOne(
          { catererId: caterer, date },
          { $set: { meals: [...kept, ...meals], updatedBy: actorId } },
          { upsert: true, runValidators: true, session: txn }
        )
      }
    })
  },

  /**
   * Remove overrides on these dates: the meals named in `mealNames`, or all of
   * them when it is null. A date left with no meals loses its document.
   */
  async removeDateMeals({ catererId, dates, mealNames = null, actorId = null }, { session } = {}) {
    const caterer = toObjectId(catererId)
    if (!mealNames) {
      const res = await DiningMenuDay.deleteMany({ catererId: caterer, date: { $in: dates } }, { session })
      return res.deletedCount || 0
    }
    const keys = new Set(mealNames.map(mealKey))
    return inSession(session, async (txn) => {
      let removed = 0
      for (const date of dates) {
        const existing = await DiningMenuDay.findOne({ catererId: caterer, date }).session(txn).lean()
        if (!existing) continue
        const kept = existing.meals.filter((meal) => !keys.has(mealKey(meal.name)))
        removed += existing.meals.length - kept.length
        if (!kept.length) {
          await DiningMenuDay.deleteOne({ _id: existing._id }, { session: txn })
        } else if (kept.length !== existing.meals.length) {
          await DiningMenuDay.updateOne({ _id: existing._id }, { $set: { meals: kept, updatedBy: actorId } }, { session: txn })
        }
      }
      return removed
    })
  },
}

export default menuOwner
