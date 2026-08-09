/**
 * User Queries Service
 * --------------------
 * The single READ surface for the core `User` collection (identity/auth) — and,
 * later, PasswordResetToken. Per the domain-ownership rule, the model is read
 * ONLY inside `src/services/user/`; callers read through these instead of
 * importing the model (writes live in userOwner.service.js). The 8 staff role
 * sub-models (Admin/Warden/…) have their OWN service pair (staffRoles*).
 *
 * This is auth-critical: findByIdSafe is the session → user resolution used by
 * the auth middleware and socket auth. It returns a HYDRATED doc WITHOUT the
 * password field (`.select("-password")`), exactly as the original callers did.
 *
 * Migration is chunked across turns; methods are added per chunk.
 */

import { User } from "../../models/index.js"

export const userQueries = {
  /**
   * One user by id, HYDRATED, password field excluded — the canonical
   * session→user lookup (auth middleware, socket auth). Returns doc or null.
   */
  async findByIdSafe(userId) {
    return User.findById(userId).select("-password")
  },

  /** One user by id, HYDRATED (full doc incl. hostel virtual). Returns doc or null. */
  async findUserById(id) {
    return User.findById(id)
  },

  /** One user by exact (case-insensitive) email — staff-creation duplicate check. */
  async findUserByEmailCI(email) {
    return User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
  },
}

export default userQueries
