/**
 * Undertaking Assignment Queries Service
 * --------------------------------------
 * The single READ surface for the UndertakingAssignment collection. The
 * undertakings app-service reads through these instead of importing the model,
 * so it is touched only inside `src/services/certificate/` (writes live in
 * undertakingAssignmentOwner.service.js).
 *
 * populate choices mirror each original caller EXACTLY. Bare findOne returns a
 * hydrated doc (mutate-then-persist: mark-viewed / accept).
 */

import { UndertakingAssignment } from "../../models/index.js"

// Student + user nested populate shared by the admin assignment/status reads.
const STUDENT_POPULATE = {
  path: "studentId",
  select: "_id rollNumber",
  populate: { path: "userId", select: "name email" },
}

export const undertakingAssignmentQueries = {
  /** Assignments for an undertaking with student+user populated (admin views). */
  async findAssignmentsByUndertaking(undertakingId) {
    return UndertakingAssignment.find({ undertakingId }).populate(STUDENT_POPULATE)
  },

  /** A student's assignments at the given status(es), with undertaking populated. */
  async findStudentAssignmentsPopulated(studentId, status) {
    return UndertakingAssignment.find({ studentId, status }).populate("undertakingId")
  },

  /** One student's assignment to an undertaking (hydrated — mutate-then-persist). */
  async findAssignment(undertakingId, studentId) {
    return UndertakingAssignment.findOne({ undertakingId, studentId })
  },

  /** Count a student's assignments at the given status(es). */
  async countStudentAssignmentsByStatus(studentId, status) {
    return UndertakingAssignment.countDocuments({ studentId, status })
  },
}

export default undertakingAssignmentQueries
