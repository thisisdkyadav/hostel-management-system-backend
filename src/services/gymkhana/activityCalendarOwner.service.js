/**
 * Activity Calendar Owner Service
 * -------------------------------
 * The single WRITE surface for the ActivityCalendar collection (the annual
 * gymkhana master calendar). Every create/persist goes through here so the
 * model is mutated only inside `src/services/gymkhana/` (reads live in
 * activityCalendarQueries.service.js).
 *
 * Calendars are fetched hydrated by the caller, mutated in place, then
 * persisted via persistCalendar.
 */

import { ActivityCalendar } from "../../models/index.js"

export const activityCalendarOwner = {
  /** Create a calendar. Returns the created doc. */
  async createCalendar(data) {
    return ActivityCalendar.create(data)
  },

  /** Persist a hydrated calendar doc mutated by the caller. Returns the doc. */
  async persistCalendar(calendar) {
    return calendar.save()
  },
}

export default activityCalendarOwner
