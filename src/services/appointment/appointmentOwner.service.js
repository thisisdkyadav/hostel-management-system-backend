/**
 * Appointment Owner Service
 * -------------------------
 * The single owner of all WRITES to the Appointment collection ("JRAppointment"
 * — public visitor appointment requests). The appointments app-service builds or
 * mutates a hydrated appointment (submit, review approve/reject, gate entry) and
 * persists it here; nothing else writes this collection. The model has no hooks,
 * so persist() is a plain save; this keeps every write for the collection inside
 * this directory (the enforceable boundary).
 */

import { Appointment } from "../../models/index.js"

export const appointmentOwner = {
  /** Create a new appointment; returns the created doc. */
  async create(data) {
    return Appointment.create(data)
  },

  /** Persist a mutated hydrated appointment (review / gate entry). */
  async persist(appointment) {
    await appointment.save()
    return appointment
  },
}

export default appointmentOwner
