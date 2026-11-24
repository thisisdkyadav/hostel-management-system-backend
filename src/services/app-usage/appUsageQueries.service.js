/**
 * App Usage Queries Service
 * -------------------------
 * The single READ surface for the `AppDevice` collection. Returns plain objects.
 */

import { AppDevice } from "../../models/index.js"

export const appUsageQueries = {
  /** Every device row, lean, with only the fields the stats need. */
  async findAllForStats() {
    return AppDevice.find({}, "userId platform browser mode layout installedHint visits firstSeenAt lastSeenAt firstAppAt lastAppAt").lean()
  },
}

export default appUsageQueries
