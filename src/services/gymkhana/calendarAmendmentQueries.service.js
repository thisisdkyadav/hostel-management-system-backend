/**
 * Calendar Amendment Queries Service
 * ----------------------------------
 * The single READ surface for the CalendarAmendment collection. The amendment
 * app-service reads through these instead of importing the model, so
 * CalendarAmendment is touched only inside `src/services/gymkhana/` (writes
 * live in calendarAmendmentOwner.service.js).
 *
 * populate/sort choices mirror each original caller EXACTLY. Bare findById
 * returns a hydrated doc (mutate-then-persist).
 */

import { CalendarAmendment } from "../../models/index.js"

export const calendarAmendmentQueries = {
  /** Amendment by id (hydrated — mutate-then-persist on review). */
  async findAmendmentById(id) {
    return CalendarAmendment.findById(id)
  },

  /** Amendments at a given status, requester + event populated (admin queue). */
  async findAmendmentsByStatus(status) {
    return CalendarAmendment.find({ status })
      .populate("requestedBy", "name email")
      .populate("eventId", "title")
      .sort({ createdAt: -1 })
  },

  /** Amendments for a calendar, requester + reviewer populated (calendar view). */
  async findAmendmentsByCalendar(calendarId) {
    return CalendarAmendment.find({ calendarId })
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })
  },
}

export default calendarAmendmentQueries
