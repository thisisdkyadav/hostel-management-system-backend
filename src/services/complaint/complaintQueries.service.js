/**
 * Complaint Queries Service
 * -------------------------
 * The single READ surface for the Complaint + FeedbackToken collections. Every
 * module that reads complaints (the complaints app-service plus the admin,
 * hostel, dashboard, stats and profiles-self readers) calls these instead of
 * importing the models, so both are touched only inside `src/services/complaint/`
 * (writes live in complaintOwner.service.js).
 */

import { Complaint, FeedbackToken } from "../../models/index.js"

// Full hydration for the admin/staff complaint list + detail views.
const FULL_POPULATE = [
  ["userId", "name email phone profileImage role"],
  ["hostelId", "name"],
  ["unitId", "unitNumber"],
  ["roomId", "roomNumber"],
  ["assignedTo", "name email phone profileImage"],
  ["resolvedBy", "name email phone profileImage"],
]
const applyFull = (query) => FULL_POPULATE.reduce((q, [path, select]) => q.populate(path, select), query)

export const complaintQueries = {
  // ==================== Complaint ====================

  /** Count complaints matching a filter (lists, stats, dashboards). */
  async countComplaints(filter = {}) {
    return Complaint.countDocuments(filter)
  },

  /** Group counts by a top-level field ("status" | "category") -> [{_id,count}]. */
  async countGroupedBy(field) {
    return Complaint.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }])
  },

  /** Paginated, fully-populated complaint list, newest first. */
  async listComplaintsPopulated(filter = {}, { skip = 0, limit = 10 } = {}) {
    return applyFull(Complaint.find(filter)).sort({ createdAt: -1 }).skip(skip).limit(limit)
  },

  /** One complaint, fully populated (detail view). */
  async findComplaintByIdFull(complaintId) {
    return applyFull(Complaint.findById(complaintId))
  },

  /** One complaint, unpopulated (mutate-then-persist paths). */
  async findComplaintById(complaintId) {
    return Complaint.findById(complaintId)
  },

  /** One complaint with just the requester's name/email (resolve email flow). */
  async findComplaintByIdWithUser(complaintId) {
    return Complaint.findById(complaintId).populate("userId", "name email")
  },

  /** One complaint populated for the public feedback page. */
  async findComplaintByIdPublic(complaintId) {
    return Complaint.findById(complaintId)
      .populate("userId", "name email")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("resolvedBy", "name")
  },

  /** Recent complaints for the ops dashboard (populated, capped). */
  async findRecentPopulated(limit = 5) {
    return Complaint.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("userId", "name")
      .populate("hostelId", "name")
      .populate("roomId", "roomNumber")
      .populate("unitId", "unitNumber")
  },

  /**
   * Per-resolver rating totals from rated, resolved complaints.
   * `since` limits to ratings whose complaint was last updated in-window
   * (feedback writes bump updatedAt). `excludeUserIds` drops those resolvers
   * (admins). No rating-value floor — a 4★ average still counts as "lowest"
   * if that is the floor in the window.
   * Returns [{ _id: resolvedBy, avgRating, ratingCount }].
   */
  async aggregateResolverRatings({ since = null, excludeUserIds = [] } = {}) {
    const resolvedBy = { $ne: null }
    if (excludeUserIds.length > 0) resolvedBy.$nin = excludeUserIds

    const match = {
      status: "Resolved",
      resolvedBy,
      feedbackRating: { $exists: true, $ne: null },
    }
    if (since) match.updatedAt = { $gte: since }

    return Complaint.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$resolvedBy",
          avgRating: { $avg: "$feedbackRating" },
          ratingCount: { $sum: 1 },
        },
      },
    ])
  },

  /** All complaints raised by a user (unpopulated; caller tallies by status). */
  async findComplaintsByUser(userId) {
    return Complaint.find({ userId })
  },

  // ==================== FeedbackToken (legacy) ====================

  /** Legacy feedback token by raw token string. */
  async findFeedbackTokenByToken(token) {
    return FeedbackToken.findOne({ token })
  },
}

export default complaintQueries
