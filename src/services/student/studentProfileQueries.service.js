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

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const studentProfileQueries = {
  // ==================== chunk: campus-life ====================

  /** One profile by userId, HYDRATED. Options: { select, lean, session }. */
  async findByUserId(userId, { select, lean, session } = {}) {
    let query = StudentProfile.findOne({ userId })
    if (select) query = query.select(select)
    if (session) query = query.session(session)
    if (lean) query = query.lean()
    return query
  },

  /**
   * Profiles for a set of roll numbers. Options preserve each caller's exact
   * shape: { select } projection, { lean } POJO, { session } transaction enlist.
   * Bare call (no opts) = HYDRATED find (undertakings bulk add).
   */
  async findByRollNumbers(rollNumbers, { select, lean, session, populate } = {}) {
    let query = StudentProfile.find({ rollNumber: { $in: rollNumbers } })
    if (select) query = query.select(select)
    if (populate) query = query.populate(populate)
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

  // ==================== chunk: student-affairs ====================

  /** Active profiles for roll numbers, with userId (name/email/role/image) — elections voters. */
  async findActiveByRollNumbersWithUser(rollNumbers) {
    return StudentProfile.find({ rollNumber: { $in: rollNumbers }, status: "Active" })
      .populate({ path: "userId", select: "name email role profileImage" })
  },

  /** Profiles matching an arbitrary scope query, with userId (name/email/role) — election scope. */
  async findByQueryWithUserRole(query) {
    return StudentProfile.find(query).populate({ path: "userId", select: "name email role" })
  },

  /** Profiles matching an arbitrary query, with userId (name/email/image) — voter dispatch. */
  async findByQueryWithUserImage(query) {
    return StudentProfile.find(query).populate({ path: "userId", select: "name email profileImage" })
  },

  /** Active profile by userId with userId + currentRoomAllocation→hostel populated (voting relations). */
  async findActiveByUserIdWithRelations(userId) {
    return StudentProfile.findOne({ userId, status: "Active" })
      .populate({ path: "userId", select: "name email role profileImage" })
      .populate({ path: "currentRoomAllocation", populate: { path: "hostelId", select: "name" } })
  },

  /** Profiles for a set of userIds, LEAN, taxonomy projection (por/best-performer submitter maps). */
  async findByUserIdsSelectTaxonomy(userIds) {
    return StudentProfile.find({ userId: { $in: userIds } })
      .select("userId rollNumber department degree batch")
      .lean()
  },

  /** One profile by case-insensitive exact roll number, with userId populated (attendance scan). */
  async findByRollNumberCaseInsensitiveWithUser(rollNumber) {
    return StudentProfile.findOne({
      rollNumber: { $regex: new RegExp(`^${escapeRegex(rollNumber)}$`, "i") },
    })
      .select("rollNumber department degree batch userId")
      .populate("userId", "name email profileImage")
  },

  /** One profile by userId with userId (name/email/image) populated (best-performer self). */
  async findByUserIdWithUserImage(userId) {
    return StudentProfile.findOne({ userId })
      .populate({ path: "userId", select: "name email profileImage" })
  },

  /** One profile by userId with userId (name/email/image/phone) populated (self-service edit view). */
  async findByUserIdWithUserContact(userId) {
    return StudentProfile.findOne({ userId }).populate("userId", "name email profileImage phone")
  },

  // ==================== chunk: dining ====================

  /** Count profiles matching a filter (dining eligibility / dashboard tallies). */
  async countProfiles(filter = {}) {
    return StudentProfile.countDocuments(filter)
  },

  /** One profile by a single roll number. Options: { select, lean }. */
  async findByRollNumber(rollNumber, { select, lean } = {}) {
    let query = StudentProfile.findOne({ rollNumber })
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** Active profiles for a set of roll numbers. Options: { select, lean } (no populate). */
  async findActiveByRollNumbers(rollNumbers, { select, lean } = {}) {
    let query = StudentProfile.find({ rollNumber: { $in: rollNumbers }, status: "Active" })
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },

  /** One profile by case-insensitive exact roll number, userId (name/email/image) populated, NO select (meal verification). */
  async findByRollNumberCaseInsensitiveWithUserFull(rollNumber) {
    return StudentProfile.findOne({
      rollNumber: { $regex: new RegExp(`^${escapeRegex(rollNumber)}$`, "i") },
    }).populate({ path: "userId", select: "name email profileImage" })
  },

  // ==================== chunk: operations + hostel + misc ====================

  /** Aggregation passthrough (dashboard degree/gender tallies). */
  async aggregateProfiles(pipeline) {
    return StudentProfile.aggregate(pipeline)
  },

  /** One profile by _id (studentProfileId), HYDRATED (inventory lookups). */
  async findById(id) {
    return StudentProfile.findById(id)
  },

  /**
   * One profile by PARTIAL case-insensitive roll number (unanchored, raw pattern
   * — matches the original inventory `{ $regex: rollNumber, $options: 'i' }`).
   */
  async findByRollNumberRegexPartial(rollNumber) {
    return StudentProfile.findOne({ rollNumber: { $regex: rollNumber, $options: "i" } })
  },

  /**
   * One profile by anchored case-insensitive roll number (raw, UN-escaped —
   * matches scanner-action's `new RegExp(\`^${rollNumber}$\`, "i")`), with userId
   * (name/email/phone/image) + currentRoomAllocation → room→unit + hostel populated.
   */
  async findByRollNumberAnchoredWithUser(rollNumber) {
    return StudentProfile.findOne({
      rollNumber: { $regex: new RegExp(`^${rollNumber}$`, "i") },
    })
      .populate({ path: "userId", select: "name email phone profileImage" })
      .populate({
        path: "currentRoomAllocation",
        populate: [
          { path: "roomId", select: "roomNumber", populate: { path: "unitId", select: "unitNumber" } },
          { path: "hostelId", select: "name type" },
        ],
      })
  },
}

export default studentProfileQueries
