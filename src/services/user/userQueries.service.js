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

  /** One user by id, HYDRATED (full doc incl. hostel virtual). Options: { select, lean }. */
  async findUserById(id, { select, lean } = {}) {
    let query = User.findById(id)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /**
   * One user by exact (case-insensitive) email. Options: { select, lean, excludeId }.
   * excludeId adds `_id: { $ne: excludeId }` (uniqueness check that ignores self).
   */
  async findUserByEmailCI(email, { select, lean, excludeId } = {}) {
    const filter = { email: { $regex: new RegExp(`^${email}$`, "i") } }
    if (excludeId) filter._id = { $ne: excludeId }
    let query = User.findOne(filter)
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  // ---- repository-style reads (User is queried many ways; filter built by caller) ----

  /** findOne by arbitrary filter. Options: { select, lean, sort }. */
  async findOneUser(filter, { select, lean, sort } = {}) {
    let query = User.findOne(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (lean) query = query.lean()
    return query
  },

  /** find by arbitrary filter. Options: { select, lean, sort, limit, session }. */
  async findUsers(filter, { select, lean, sort, limit, session } = {}) {
    let query = User.find(filter)
    if (select) query = query.select(select)
    if (sort) query = query.sort(sort)
    if (limit) query = query.limit(limit)
    if (session) query = query.session(session)
    if (lean) query = query.lean()
    return query
  },

  /** Count users matching a filter. */
  async countUsers(filter = {}) {
    return User.countDocuments(filter)
  },
}

export default userQueries
