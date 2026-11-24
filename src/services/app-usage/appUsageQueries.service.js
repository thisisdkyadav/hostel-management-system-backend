/**
 * App Usage Queries Service
 * -------------------------
 * The single READ surface for the app-usage collections (AppDevice, PageVisit,
 * PageVisitTotal). Returns plain objects.
 */

import { AppDevice, PageVisit, PageVisitTotal } from "../../models/index.js"

export const appUsageQueries = {
  /** Every device row, lean, with only the fields the stats need. */
  async findAllForStats() {
    return AppDevice.find({}, "userId platform browser mode layout installedHint visits firstSeenAt lastSeenAt firstAppAt lastAppAt").lean()
  },

  /** Per role since `since`: { _id: role, visits, users } from the 7-day events. */
  async recentVisitsByRole(since) {
    return PageVisit.aggregate([
      { $match: { at: { $gte: since } } },
      { $group: { _id: { role: "$role", userId: "$userId" }, visits: { $sum: 1 } } },
      { $group: { _id: "$_id.role", visits: { $sum: "$visits" }, users: { $sum: 1 } } },
    ])
  },

  /** Per role, all time: { _id: role, users, visits } from the totals. */
  async totalsByRole() {
    return PageVisitTotal.aggregate([
      { $group: { _id: { role: "$role", userId: "$userId" }, visits: { $sum: "$count" } } },
      { $group: { _id: "$_id.role", visits: { $sum: "$visits" }, users: { $sum: 1 } } },
    ])
  },

  /**
   * Users of a role with their all-time totals, most recently active first:
   * { items: [{ _id: userId, visits, pages, lastAt }], total }.
   * `userIds` narrows to those users (search).
   */
  async usersWithTotals({ role, userIds = null, skip = 0, limit = 50 }) {
    const match = { role }
    if (userIds) match.userId = { $in: userIds }
    const [result] = await PageVisitTotal.aggregate([
      { $match: match },
      { $group: { _id: "$userId", visits: { $sum: "$count" }, pages: { $sum: 1 }, lastAt: { $max: "$lastAt" } } },
      { $sort: { lastAt: -1 } },
      { $facet: { items: [{ $skip: skip }, { $limit: limit }], total: [{ $count: "n" }] } },
    ])
    return { items: result?.items || [], total: result?.total?.[0]?.n || 0 }
  },

  /** Visits per user in the 7-day events for these users: [{ _id: userId, visits }]. */
  async recentVisitsForUsers(userIds, since) {
    return PageVisit.aggregate([{ $match: { userId: { $in: userIds }, at: { $gte: since } } }, { $group: { _id: "$userId", visits: { $sum: 1 } } }])
  },

  /** One user's all-time per-page totals, most recent first. */
  async pageTotalsForUser(userId) {
    return PageVisitTotal.find({ userId }, "page label count firstAt lastAt role").sort({ lastAt: -1 }).lean()
  },

  /** One user's page visits since `since`, oldest first. */
  async visitsForUser(userId, since) {
    return PageVisit.find({ userId, at: { $gte: since } }, "page label path platform mode at").sort({ at: 1 }).lean()
  },
}

export default appUsageQueries
