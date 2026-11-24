/**
 * App Usage Owner Service
 * -----------------------
 * The single WRITE surface for the app-usage collections — `AppDevice`,
 * `PageVisit`, `PageVisitTotal` (reads live in appUsageQueries.service.js).
 */

import { AppDevice, PageVisit, PageVisitTotal } from "../../models/index.js"

export const appUsageOwner = {
  /**
   * Record one visit from a student's device: upsert by (userId, deviceId),
   * bump the visit count and last-seen time, and stamp app-open times when the
   * visit ran inside the installed app.
   */
  async recordVisit({ userId, deviceId, platform, browser, mode, layout, installedHint, at = new Date() }) {
    const set = { platform, browser, mode, layout, lastSeenAt: at }
    if (installedHint !== null && installedHint !== undefined) set.installedHint = installedHint
    const update = {
      $set: set,
      $inc: { visits: 1 },
      $setOnInsert: { firstSeenAt: at },
    }
    if (mode === "app") set.lastAppAt = at
    const result = await AppDevice.updateOne({ userId, deviceId }, update, { upsert: true })
    // First time this device ran the app. ($min can't do it: null sorts below any date.)
    if (mode === "app") await AppDevice.updateOne({ userId, deviceId, firstAppAt: null }, { $set: { firstAppAt: at } })
    return result
  },

  /** One page opened: the 7-day event row plus the all-time per-page total. */
  async recordPageVisit({ userId, role, page, label, path, platform, mode, at = new Date() }) {
    await Promise.all([
      PageVisit.create({ userId, role, page, label, path, platform, mode, at }),
      PageVisitTotal.updateOne(
        { userId, page },
        { $set: { role, label, lastAt: at }, $inc: { count: 1 }, $setOnInsert: { firstAt: at } },
        { upsert: true }
      ),
    ])
  },
}

export default appUsageOwner
