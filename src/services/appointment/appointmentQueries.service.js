/**
 * Appointment Queries Service
 * ---------------------------
 * The single READ surface for the Appointment collection (model registered as
 * "JRAppointment" — public visitor appointment requests for meeting Admin
 * officials). The appointments app-service uses these instead of importing the
 * model, so Appointment is touched only inside `src/services/appointment/`
 * (writes live in appointmentOwner.service.js).
 */

import { Appointment } from "../../models/index.js"

// The recurring "full" hydration used by list/detail views.
const FULL_POPULATE = [
  ["targetAdminUserId", "name email subRole"],
  ["review.reviewedBy", "name email subRole"],
  ["gateEntry.markedBy", "name email"],
]
const applyFull = (query) =>
  FULL_POPULATE.reduce((q, [path, select]) => q.populate(path, select), query)

export const appointmentQueries = {
  /** By id, with the target official populated (submit ack + review load). */
  async findByIdWithTarget(appointmentId) {
    return Appointment.findById(appointmentId).populate("targetAdminUserId", "name email subRole")
  },

  /** By id, fully hydrated (detail view + post-write refresh). */
  async findByIdFull(appointmentId) {
    return applyFull(Appointment.findById(appointmentId))
  },

  /** By id, raw (gate-entry mutation load — no populate needed). */
  async findByIdRaw(appointmentId) {
    return Appointment.findById(appointmentId)
  },

  /** Fully-hydrated paginated list. Caller supplies filter + sort. */
  async listFull(filter = {}, { skip = 0, limit = 10, sort = { createdAt: -1 } } = {}) {
    return applyFull(Appointment.find(filter)).sort(sort).skip(skip).limit(limit)
  },

  /** Count for a filter (list pagination). */
  async count(filter = {}) {
    return Appointment.countDocuments(filter)
  },
}

export default appointmentQueries
