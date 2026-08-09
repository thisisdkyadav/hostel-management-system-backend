/**
 * User Owner Service
 * ------------------
 * The single WRITE surface for the core `User` collection (identity/auth) — and
 * PasswordResetToken later. Per the domain-ownership rule + the SPLIT choice,
 * User is mutated ONLY inside `src/services/user/` (reads in
 * userQueries.service.js; the 8 role sub-models have staffRoles*).
 *
 * User has a `pre("save")` hook (sets updatedAt only — NO password hashing;
 * callers hash manually with bcrypt before createUser). createUser goes through
 * the save path (User.create fires the hook) — equivalent to the old
 * `new User(data).save()`. updateUserById forwards options (default none —
 * callers historically passed no options / findByIdAndUpdate without {new}).
 */

import { User } from "../../models/index.js"

export const userOwner = {
  /** Create a user (pre-save hook sets updatedAt; password already hashed by caller). */
  async createUser(data) {
    return User.create(data)
  },

  /**
   * Update a user by id. Mongoose options ({ new, runValidators, … }) pass through;
   * { select, lean } are applied as query modifiers on the returned doc. Default
   * none — matches callers that pass no options. Returns doc or null.
   */
  async updateUserById(id, updates, { select, lean, ...options } = {}) {
    let query = User.findByIdAndUpdate(id, updates, options)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Delete a user by id. Returns the deleted doc or null. */
  async deleteUserById(id) {
    return User.findByIdAndDelete(id)
  },

  /** updateOne by arbitrary filter (options e.g. {}). Returns the raw result. */
  async updateOneUser(filter, update, options = {}) {
    return User.updateOne(filter, update, options)
  },

  /**
   * findOneAndUpdate by arbitrary filter. Mongoose options ({ new, upsert }) pass
   * through; { select, lean } are applied as query modifiers on the returned doc.
   * Returns doc or null.
   */
  async findOneAndUpdateUser(filter, update, { select, lean, ...options } = {}) {
    let query = User.findOneAndUpdate(filter, update, options)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** findOneAndDelete by arbitrary filter. Returns the deleted doc or null. */
  async findOneAndDeleteUser(filter) {
    return User.findOneAndDelete(filter)
  },

  /** Persist a hydrated User doc (mutate-then-save: password reset flows). Fires pre-save. */
  async persist(doc) {
    return doc.save()
  },

  /**
   * Raw bulk insert via the native driver (bypasses mongoose validation/hooks/defaults) —
   * bulk student-profile creation inside a transaction. Returns { insertedIds, ... }.
   */
  async insertUsersRaw(docs, options = {}) {
    return User.collection.insertMany(docs, options)
  },

  /** bulkWrite (session-bound ops — bulk student-profile update inside a transaction). */
  async bulkWriteUsers(ops, options = {}) {
    return User.bulkWrite(ops, options)
  },
}

export default userOwner
