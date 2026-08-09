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

  /** Profiles for a set of roll numbers, HYDRATED bare (undertakings bulk add). */
  async findByRollNumbers(rollNumbers) {
    return StudentProfile.find({ rollNumber: { $in: rollNumbers } })
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
}

export default studentProfileQueries
