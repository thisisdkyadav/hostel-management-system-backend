/**
 * Activity Calendar Queries Service
 * ---------------------------------
 * The single READ surface for the ActivityCalendar collection. The calendar,
 * proposal, expense and amendment app-services read through these instead of
 * importing the model, so ActivityCalendar is touched only inside
 * `src/services/gymkhana/` (writes live in activityCalendarOwner.service.js).
 *
 * populate/select/sort choices mirror each original caller EXACTLY. Bare
 * findById/findOne return hydrated docs (mutate-then-persist or virtuals).
 */

import { ActivityCalendar } from "../../models/index.js"

export const activityCalendarQueries = {
  /** Calendar by id (hydrated — mutate-then-persist and overlap checks). */
  async findCalendarById(id) {
    return ActivityCalendar.findById(id)
  },

  /** Calendar by id with actor refs populated (detail view). */
  async findCalendarByIdPopulated(id) {
    return ActivityCalendar.findById(id)
      .populate("createdBy", "name email")
      .populate("rejectedBy", "name email")
      .populate("lockedBy", "name email")
  },

  /** Calendar by academic year (bare — duplicate-year guard on create). */
  async findCalendarByAcademicYear(year) {
    return ActivityCalendar.findOne({ academicYear: year })
  },

  /** Calendar by academic year with actor refs populated (detail-by-year view). */
  async findCalendarByYearPopulated(year) {
    return ActivityCalendar.findOne({ academicYear: year })
      .populate("createdBy", "name email")
      .populate("lockedBy", "name email")
  },

  /** Latest calendar at a given status, newest first (e.g. current approved). */
  async findLatestCalendarByStatus(status) {
    return ActivityCalendar.findOne({ status }).sort({ createdAt: -1 })
  },

  /** Academic-year dropdown: id/year/status/isLocked, newest year first. */
  async listAcademicYears() {
    return ActivityCalendar.find({}, "academicYear status isLocked").sort({ academicYear: -1 })
  },

  /** Paginated calendars, newest first (mirrors BaseService.findPaginated). */
  async listCalendars(filter = {}, { skip = 0, limit = 10 } = {}) {
    return ActivityCalendar.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
  },

  /** Count calendars matching a filter (pagination total). */
  async countCalendars(filter = {}) {
    return ActivityCalendar.countDocuments(filter)
  },

  /** Calendar status gate fields (proposal submission window check). */
  async findCalendarStatusFields(id) {
    return ActivityCalendar.findById(id).select("status allowProposalBeforeApproval academicYear")
  },

  /** Just a calendar's academic year (deep-link context). */
  async findCalendarAcademicYear(id) {
    return ActivityCalendar.findById(id).select("academicYear")
  },
}

export default activityCalendarQueries
