/**
 * Event Owner Service
 * -------------------
 * The single WRITE surface for the campus-life `Event` collection (hostel
 * events shown to students/staff). Every create/update/delete goes through
 * here so `Event` is mutated only inside `src/services/event/` (reads live in
 * eventQueries.service.js).
 *
 * Methods return raw model results (doc or null); callers own the response
 * envelope and error handling, matching the behaviour they had under
 * BaseService.
 */

import { Event } from "../../models/index.js"

export const eventOwner = {
  /** Create an event. Returns the created doc (throws on validation/dup). */
  async createEvent(data) {
    return Event.create(data)
  },

  /** Update an event by id. Returns the updated doc, or null if not found. */
  async updateEvent(id, updates) {
    return Event.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
  },

  /** Delete an event by id. Returns the deleted doc, or null if not found. */
  async deleteEvent(id) {
    return Event.findByIdAndDelete(id)
  },
}

export default eventOwner
