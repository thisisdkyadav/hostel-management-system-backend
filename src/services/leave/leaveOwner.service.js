/**
 * Leave Owner Service
 * -------------------
 * The single owner of all WRITES to the Leave collection (staff leave requests +
 * their approve/reject/join transitions). The model has no cross-model hooks and
 * there is no counter/uniqueness concurrency hazard — each request is an
 * independent document with status transitions.
 */

import { Leave } from "../../models/index.js"

export const leaveOwner = {
  /** Create a leave request. */
  async createLeave(data) {
    return Leave.create(data)
  },

  /** Apply a status/field transition (approve / reject / join); returns doc or null. */
  async updateLeaveById(id, updates) {
    return Leave.findByIdAndUpdate(id, updates, { new: true })
  },
}

export default leaveOwner
