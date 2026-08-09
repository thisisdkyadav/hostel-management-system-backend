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

  /** Update a user by id. Options forwarded (default none — matches callers). Returns doc or null. */
  async updateUserById(id, updates, options = {}) {
    return User.findByIdAndUpdate(id, updates, options)
  },

  /** Delete a user by id. Returns the deleted doc or null. */
  async deleteUserById(id) {
    return User.findByIdAndDelete(id)
  },
}

export default userOwner
