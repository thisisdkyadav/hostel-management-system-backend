/**
 * Staff Attendance Owner Service
 * ------------------------------
 * The single owner of all WRITES to the StaffAttendance collection (staff
 * check-in/check-out records). Recording is an append-only event (no counters,
 * no unique constraint), so there is no concurrency hazard. The model has no
 * hooks.
 */

import { StaffAttendance } from "../../models/index.js"

export const staffAttendanceOwner = {
  /** Record a staff attendance event (checkIn / checkOut). */
  async createAttendance(data) {
    return StaffAttendance.create(data)
  },
}

export default staffAttendanceOwner
