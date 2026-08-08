/**
 * Leave Queries Service
 * ---------------------
 * The single READ surface for the Leave collection. The leave app-service and
 * the ops dashboard read through these instead of importing the model, so Leave
 * is touched only inside `src/services/leave/` (writes live in
 * leaveOwner.service.js).
 */

import { Leave } from "../../models/index.js"

export const leaveQueries = {
  /** All of a user's leave requests, newest first. */
  async findByUser(userId) {
    return Leave.find({ userId }).sort({ createdAt: -1 }).lean()
  },

  /** Count leave requests matching a filter (pagination total). */
  async countLeaves(filter = {}) {
    return Leave.countDocuments(filter)
  },

  /** Paginated leave requests, newest first, requester populated. */
  async listLeaves(filter = {}, { skip = 0, limit = 10 } = {}) {
    return Leave.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email")
      .lean()
  },

  /** Approved leaves active on `today` (dashboard "who's on leave"). */
  async findActiveApprovedLeaves(today) {
    return Leave.find({
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: "Approved",
    })
      .sort({ startDate: 1 })
      .populate("userId", "name email")
      .populate("approvalBy", "name email")
      .lean()
  },
}

export default leaveQueries
