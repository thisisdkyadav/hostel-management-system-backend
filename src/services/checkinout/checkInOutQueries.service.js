/**
 * CheckInOut Queries Service
 * --------------------------
 * The single READ surface for the CheckInOut collection (campus gate
 * check-in/out log). The live-checkinout, face-scanner and security modules read
 * through these instead of importing the model, so CheckInOut is touched only
 * inside `src/services/checkinout/` (writes live in checkInOutOwner.service.js).
 *
 * CheckInOut is an append-only event log (no unique constraint, no counters), so
 * these are plain reads/aggregations — the populate chains and lean/hydrated
 * choices mirror each original caller exactly.
 */

import { CheckInOut } from "../../models/index.js"

export const checkInOutQueries = {
  /** Generic count (live stats, security pagination totals). */
  async countEntries(filter = {}) {
    return CheckInOut.countDocuments(filter)
  },

  // ---- live-checkinout dashboard (lean) ----

  /** Paginated live feed, caller-supplied sort (lean, populated). */
  async listLiveEntries(query = {}, { sort = { dateAndTime: -1 }, skip = 0, limit = 10 } = {}) {
    return CheckInOut.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email phone profileImage")
      .populate("hostelId", "name type")
      .lean()
      .exec()
  },

  /** Recent activity timeline (lean, populated). */
  async listRecentActivity(limit = 50) {
    return CheckInOut.find()
      .sort({ dateAndTime: -1 })
      .limit(limit)
      .populate("userId", "name email phone profileImage")
      .populate("hostelId", "name type")
      .lean()
      .exec()
  },

  /** Hostel-wise stats for entries since `since` (today). */
  async aggregateHostelWiseStats(since) {
    return CheckInOut.aggregate([
      { $match: { dateAndTime: { $gte: since } } },
      {
        $group: {
          _id: "$hostelId",
          checkedIn: { $sum: { $cond: [{ $eq: ["$status", "Checked In"] }, 1, 0] } },
          checkedOut: { $sum: { $cond: [{ $eq: ["$status", "Checked Out"] }, 1, 0] } },
          crossHostel: { $sum: { $cond: [{ $eq: ["$isSameHostel", false] }, 1, 0] } },
        },
      },
      { $lookup: { from: "hostels", localField: "_id", foreignField: "_id", as: "hostelInfo" } },
      { $unwind: "$hostelInfo" },
      {
        $project: {
          hostelId: "$_id",
          hostelName: "$hostelInfo.name",
          hostelType: "$hostelInfo.type",
          checkedIn: 1,
          checkedOut: 1,
          crossHostel: 1,
          total: { $add: ["$checkedIn", "$checkedOut"] },
        },
      },
      { $sort: { total: -1 } },
    ])
  },

  /** Hourly check-in/out distribution within [from, to). */
  async aggregateHourlyStats(from, to) {
    return CheckInOut.aggregate([
      { $match: { dateAndTime: { $gte: from, $lt: to } } },
      { $project: { hour: { $hour: "$dateAndTime" }, status: 1 } },
      {
        $group: {
          _id: "$hour",
          checkedIn: { $sum: { $cond: [{ $eq: ["$status", "Checked In"] }, 1, 0] } },
          checkedOut: { $sum: { $cond: [{ $eq: ["$status", "Checked Out"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ])
  },

  // ---- security module (hydrated) ----

  /** Recent entries for a hostel (security dashboard, hydrated). */
  async listRecentByHostel(query = {}, limit = 10) {
    return CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .limit(limit)
      .populate("userId", "name email phone profileImage")
      .populate("hostelId", "name")
      .exec()
  },

  /** Paginated student entries (security, hydrated). */
  async listStudentEntries(query = {}, { skip = 0, limit = 10 } = {}) {
    return CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email phone")
      .exec()
  },

  /** Paginated face-scanner entries (security, hydrated). */
  async listFaceScannerEntries(query = {}, { skip = 0, limit = 20 } = {}) {
    return CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate("userId", "name email phone profileImage")
      .populate("hostelId", "name type")
      .exec()
  },

  /** One entry by id (hydrated, for mutate-then-persist). */
  async findEntryById(entryId) {
    return CheckInOut.findById(entryId)
  },

  /** The user's most recent entry (verifyQR last status). */
  async findLastEntryByUser(userId) {
    return CheckInOut.findOne({ userId }).sort({ dateAndTime: -1 }).exec()
  },
}

export default checkInOutQueries
