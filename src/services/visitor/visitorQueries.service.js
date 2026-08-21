/**
 * Visitor Queries Service
 * -----------------------
 * The single READ surface for the visitor domain's three collections:
 *   - VisitorRequest  (student stay requests)
 *   - VisitorProfile  (a student's saved visitors)
 *   - Visitors        (registered as "Visitor" — quick gate check-in/out log)
 *
 * Callers (visitors app, security, stats) use these instead of importing the
 * models, so all three are touched only inside `src/services/visitor/` (writes
 * live in visitorOwner.service.js). Reads return hydrated docs where the caller
 * relies on populated relations / instance shape.
 */

import { Visitors, VisitorProfile, VisitorRequest } from "../../models/index.js"

const withSession = (query, session) => (session ? query.session(session) : query)

export const visitorQueries = {
  // ==================== VisitorRequest ====================

  /** Paginated request list (hydrated + populated), newest first. */
  async findRequestsForList(filter = {}, { skip = 0, limit = 10 } = {}) {
    return VisitorRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email profileImage")
      .populate("visitors")
  },

  /** Count requests matching a filter (list pagination). */
  async countRequests(filter = {}) {
    return VisitorRequest.countDocuments(filter)
  },

  /** One request fully populated for the detail view. */
  async findRequestByIdDetailed(requestId) {
    return VisitorRequest.findById(requestId)
      .populate("userId", "name email profileImage")
      .populate("visitors")
      .populate({ path: "allocatedRooms", populate: { path: "unitId", select: "unitNumber" } })
      .populate("hostelId", "name")
  },

  /** One request (hydrated, unpopulated) — e.g. pending-status check before update. */
  async findRequestById(requestId, { session } = {}) {
    return withSession(VisitorRequest.findById(requestId), session)
  },

  /** All requests raised by a student (hydrated + populated). */
  async findRequestsByUser(userId) {
    return VisitorRequest.find({ userId })
      .populate("userId", "name email profileImage")
      .populate("visitors")
  },

  // ==================== VisitorProfile ====================

  /** A student's saved visitor profiles (hydrated). */
  /** Single visitor profile by id. */
  async findProfileById(profileId) {
    return VisitorProfile.findById(profileId)
  },

  async findProfilesByStudent(studentUserId) {
    return VisitorProfile.find({ studentUserId })
  },

  // ==================== Visitors (check-in/out log) ====================

  /** Gate check-in/out log entries for a hostel. */
  async findVisitorsByHostel(hostelId) {
    return Visitors.find({ hostelId }).exec()
  },

  /** One check-in/out log entry (hydrated, for mutate-then-persist). */
  async findVisitorById(visitorId) {
    return Visitors.findById(visitorId)
  },

  /** Count log entries matching a filter (stats). */
  async countVisitors(filter = {}) {
    return Visitors.countDocuments(filter)
  },
}

export default visitorQueries
