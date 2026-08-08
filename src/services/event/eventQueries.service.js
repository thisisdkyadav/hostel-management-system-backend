/**
 * Event Queries Service
 * ---------------------
 * The single READ surface for the campus-life `Event` collection. The
 * campus-life event service, the ops stats/dashboard services and the common
 * data cache read through these instead of importing the model, so `Event` is
 * touched only inside `src/services/event/` (writes live in
 * eventOwner.service.js).
 *
 * populate/lean choices mirror each original caller EXACTLY.
 */

import { Event } from "../../models/index.js"

export const eventQueries = {
  /** All events matching a filter, lean (campus-life DB fallback path). */
  async findEventsLean(filter = {}) {
    return Event.find(filter).lean()
  },

  /** Count events matching a filter (hostel event stats). */
  async countEvents(filter = {}) {
    return Event.countDocuments(filter)
  },

  /**
   * Upcoming events for the ops dashboard: next `limit`, soonest first, with
   * hostel name populated. Returns hydrated docs (mapped by the caller).
   */
  async findUpcomingForDashboard(limit = 5) {
    return Event.find({ dateAndTime: { $gte: new Date() } })
      .sort({ dateAndTime: 1 })
      .limit(limit)
      .populate("hostelId", "name")
  },

  /**
   * All events for the common-data cache builder, soonest first. Returns
   * HYDRATED docs — the cache serialiser calls doc.toObject({ virtuals: true }).
   */
  async findAllForCache() {
    return Event.find({}).sort({ dateAndTime: 1 })
  },
}

export default eventQueries
