/**
 * Student Profile Queries Service
 * -------------------------------
 * The single READ surface for the `StudentProfile` collection. Callers across
 * the app read through these instead of importing the model, so it is touched
 * only inside `src/services/student/` (writes live in
 * studentProfileOwner.service.js).
 *
 * StudentProfile is the most widely-read model in the codebase (~30 files), so
 * this migration proceeds in chunks by app area. Methods are grouped by chunk;
 * each preserves its original caller's exact filter / projection / populate /
 * lean / session shape. Bare findOne/find return HYDRATED docs.
 */

import { StudentProfile } from "../../models/index.js"

export const studentProfileQueries = {
  // ==================== chunk: campus-life ====================

  /** One profile by userId, HYDRATED (undertakings / disco / certificates). */
  async findByUserId(userId) {
    return StudentProfile.findOne({ userId })
  },

  /**
   * Profiles for a set of roll numbers. Options preserve each caller's exact
   * shape: { select } projection, { lean } POJO, { session } transaction enlist.
   * Bare call (no opts) = HYDRATED find (undertakings bulk add).
   */
  async findByRollNumbers(rollNumbers, { select, lean, session } = {}) {
    let query = StudentProfile.find({ rollNumber: { $in: rollNumbers } })
    if (select) query = query.select(select)
    if (session) query = query.session(session)
    if (lean) query = query.lean()
    return query
  },

  /** One profile by userId with currentRoomAllocation → hostelId populated (notifications). */
  async findByUserIdWithAllocationHostel(userId) {
    return StudentProfile.findOne({ userId }).populate("currentRoomAllocation", "hostelId")
  },

  /** One profile by userId with currentRoomAllocation fully populated (feedback). */
  async findByUserIdWithAllocation(userId) {
    return StudentProfile.findOne({ userId }).populate("currentRoomAllocation")
  },

  /** Profiles for a set of userIds, projecting only userId (existence checks — disco). */
  async findExistingUserIds(userIds) {
    return StudentProfile.find({ userId: { $in: userIds } }, "userId")
  },

  /**
   * One profile by userId, LEAN, projecting { gender, currentRoomAllocation } with
   * currentRoomAllocation → hostelId populated (events student-scoping).
   */
  async findGenderAndAllocationByUserId(userId) {
    return StudentProfile.findOne({ userId }, { gender: 1, currentRoomAllocation: 1 })
      .populate("currentRoomAllocation", "hostelId")
      .lean()
  },

  // ==================== chunk: profiles-admin ====================

  /**
   * All-numeric roll numbers, LEAN (bulk roll-range expansion). select rollNumber,
   * transaction-enlisted.
   */
  async findNumericRollNumbers({ session } = {}) {
    let query = StudentProfile.find({ rollNumber: /^\d+$/ }).select("rollNumber")
    if (session) query = query.session(session)
    return query.lean()
  },

  /**
   * One profile by roll number with the full allocation detail chain:
   * userId (name/email/image) + currentRoomAllocation → hostel + room → unit.
   */
  async findByRollNumberWithAllocationDetail(rollNumber) {
    return StudentProfile.findOne({ rollNumber })
      .populate("userId", "name email profileImage")
      .populate({
        path: "currentRoomAllocation",
        populate: [
          { path: "hostelId", select: "name type" },
          {
            path: "roomId",
            select: "roomNumber unitId",
            populate: { path: "unitId", select: "unitNumber" },
          },
        ],
      })
  },

  /** Distinct values of a field, optionally filtered (department/degree lists). */
  async distinctField(field, filter = {}) {
    return StudentProfile.distinct(field, filter)
  },

  // ==================== model custom statics (passthrough) ====================
  // These are defined on the StudentProfile schema (in-boundary); wrapping the
  // CALL site keeps the model name out of app code. `this` stays the model.

  /** Rich populated profile(s) by userId — accepts a single id OR an array. */
  async getFullStudentData(userIdOrIds) {
    return StudentProfile.getFullStudentData(userIdOrIds)
  },

  /** Basic populated profile by userId (security lookup). */
  async getBasicStudentData(userId) {
    return StudentProfile.getBasicStudentData(userId)
  },

  /** Paginated/filtered student search (admin list + export). */
  async searchStudents(params) {
    return StudentProfile.searchStudents(params)
  },

  /** SYNC — static list of "missing field" option keys (no DB, no await). */
  getMissingFieldOptions() {
    return StudentProfile.getMissingFieldOptions()
  },
}

export default studentProfileQueries
