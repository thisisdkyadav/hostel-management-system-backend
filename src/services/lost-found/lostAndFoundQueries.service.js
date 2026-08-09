/**
 * Lost & Found Queries Service
 * ----------------------------
 * The single READ surface for the `LostAndFound` collection. Every reader (the
 * stats service and the common-data cache builder) reads through these instead
 * of importing the model, so it is touched only inside `src/services/lost-found/`
 * (writes live in lostAndFoundOwner.service.js).
 *
 * The app-service's list/pagination reads come from the Redis cache payload, not
 * the DB directly — so there is no list method here; findAllForCache is what
 * BUILDS that payload (HYDRATED, so the cache serializer's toObject works).
 */

import { LostAndFound } from "../../models/index.js"

export const lostAndFoundQueries = {
  /** Count items matching a filter (stats: total / Active / Claimed). */
  async countItems(filter = {}) {
    return LostAndFound.countDocuments(filter)
  },

  /** All items newest-first, HYDRATED — source for the common-data cache payload. */
  async findAllForCache() {
    return LostAndFound.find({}).sort({ dateFound: -1 })
  },
}

export default lostAndFoundQueries
