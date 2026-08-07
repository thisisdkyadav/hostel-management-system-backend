/**
 * Visitor Owner Service
 * ---------------------
 * The single owner of all WRITES to the visitor domain's three collections
 * (VisitorRequest, VisitorProfile, Visitors). Callers go through these instead
 * of touching the models.
 *
 * These collections carry cross-model Mongoose hooks that MUST keep firing, so
 * the owner deliberately uses the hook-triggering model methods:
 *   - VisitorRequest create  -> post('save') $addToSet's the request id into each
 *     linked VisitorProfile.requests.
 *   - VisitorRequest delete  -> pre('findOneAndDelete') blocks deleting a
 *     non-pending request; post('findOneAndDelete') $pull's the id back out of
 *     the VisitorProfile.requests arrays.
 *   - VisitorProfile update/delete -> pre('findOneAndUpdate'/'findOneAndDelete')
 *     blocks touching a profile that still has linked requests.
 * The guard hooks throw; callers surface those as error responses (as before).
 */

import { Visitors, VisitorProfile, VisitorRequest } from "../../models/index.js"

export const visitorOwner = {
  // ==================== VisitorRequest ====================

  /** Create a request (fires post-save VisitorProfile sync). Returns the doc. */
  async createRequest(data) {
    return VisitorRequest.create(data)
  },

  /** Update a request by id (validated). Optional txn session. Returns doc/null. */
  async updateRequestById(requestId, updates, { session } = {}) {
    return VisitorRequest.findByIdAndUpdate(requestId, updates, {
      new: true,
      runValidators: true,
      ...(session ? { session } : {}),
    })
  },

  /**
   * Delete a request by id. Fires the pre-delete pending guard (throws for a
   * non-pending request) and the post-delete VisitorProfile $pull. Returns the
   * deleted doc, or null if it did not exist.
   */
  async deleteRequestById(requestId) {
    return VisitorRequest.findByIdAndDelete(requestId)
  },

  // ==================== VisitorProfile ====================

  /** Create a saved visitor profile. Returns the doc. */
  async createProfile(data) {
    return VisitorProfile.create(data)
  },

  /** Update a profile by id. Fires the pre-update "has requests" guard. Returns doc/null. */
  async updateProfileById(profileId, updates) {
    return VisitorProfile.findByIdAndUpdate(profileId, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete a profile by id. Fires the pre-delete "has requests" guard. Returns doc/null. */
  async deleteProfileById(profileId) {
    return VisitorProfile.findByIdAndDelete(profileId)
  },

  // ==================== Visitors (check-in/out log) ====================

  /** Create a gate check-in log entry. Returns the doc. */
  async createVisitor(data) {
    return Visitors.create(data)
  },

  /** Persist a mutated check-in/out log entry. Returns the doc. */
  async persistVisitor(visitor) {
    await visitor.save()
    return visitor
  },

  /** Delete a check-in/out log entry by id. Returns doc/null. */
  async deleteVisitorById(visitorId) {
    return Visitors.findByIdAndDelete(visitorId)
  },
}

export default visitorOwner
