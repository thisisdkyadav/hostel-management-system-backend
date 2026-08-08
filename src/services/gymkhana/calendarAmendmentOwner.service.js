/**
 * Calendar Amendment Owner Service
 * --------------------------------
 * The single WRITE surface for the CalendarAmendment collection (requests to
 * edit/add events on an approved calendar). Every create/persist goes through
 * here so the model is mutated only inside `src/services/gymkhana/` (reads live
 * in calendarAmendmentQueries.service.js).
 */

import { CalendarAmendment } from "../../models/index.js"

export const calendarAmendmentOwner = {
  /** Create an amendment request. Returns the created doc. */
  async createAmendment(data) {
    return CalendarAmendment.create(data)
  },

  /** Persist a hydrated amendment doc mutated by the caller (review outcome). */
  async persistAmendment(amendment) {
    return amendment.save()
  },
}

export default calendarAmendmentOwner
