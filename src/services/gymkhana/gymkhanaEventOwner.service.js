/**
 * Gymkhana Event Owner Service
 * ----------------------------
 * The single WRITE surface for the GymkhanaEvent collection (individual events
 * extracted from an approved activity calendar). Every create/persist/update/
 * delete goes through here so the model is mutated only inside
 * `src/services/gymkhana/` (reads live in gymkhanaEventQueries.service.js).
 *
 * NOTE: create() and persist() (save) run the pre-save hook that computes
 * proposalDueDate (= scheduledStartDate - 60 days). updateEventById() uses
 * findByIdAndUpdate, which — matching the existing call sites — deliberately
 * does NOT run that hook, so callers pass options exactly as before.
 */

import { GymkhanaEvent } from "../../models/index.js"

export const gymkhanaEventOwner = {
  /** Create an event. Returns the created doc (pre-save hook runs). */
  async createEvent(data) {
    return GymkhanaEvent.create(data)
  },

  /** Persist a hydrated event doc mutated by the caller (pre-save hook runs). */
  async persistEvent(event) {
    return event.save()
  },

  /**
   * Update an event by id via findByIdAndUpdate. `options` is passed through
   * verbatim so each caller keeps its exact semantics (calendar sync passes
   * { new: true, runValidators: true }; approval flows pass none). Pre-save
   * hook does NOT run.
   */
  async updateEventById(id, updates, options = {}) {
    return GymkhanaEvent.findByIdAndUpdate(id, updates, options)
  },

  /** Delete events by id list (calendar-sync removal). */
  async deleteEventsByIds(ids) {
    return GymkhanaEvent.deleteMany({ _id: { $in: ids } })
  },
}

export default gymkhanaEventOwner
