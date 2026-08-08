/**
 * Gymkhana Event Queries Service
 * ------------------------------
 * The single READ surface for the GymkhanaEvent collection. The calendar,
 * proposal, expense and amendment app-services and the events controller read
 * through these instead of importing the model, so GymkhanaEvent is touched
 * only inside `src/services/gymkhana/` (writes live in
 * gymkhanaEventOwner.service.js).
 *
 * populate/select/sort choices mirror each original caller EXACTLY. Bare
 * findById returns a hydrated doc (mutate-then-persist and virtuals such as
 * isProposalOverdue). Filters for list/find methods are built by the caller.
 */

import { GymkhanaEvent } from "../../models/index.js"

export const gymkhanaEventQueries = {
  /** Event by id (hydrated — mutate-then-persist and reads). */
  async findEventById(id) {
    return GymkhanaEvent.findById(id)
  },

  /** Event deep-link fields (proposal/expense link context). */
  async findEventByIdLinkFields(id) {
    return GymkhanaEvent.findById(id).select("title isMegaEvent megaEventSeriesId calendarId")
  },

  /** Event's mega-series id only (mega vs standard branch on revision). */
  async findEventByIdSelectMega(id) {
    return GymkhanaEvent.findById(id).select("megaEventSeriesId")
  },

  /** Event by id fully populated (controller getEventById). */
  async findEventByIdFull(id) {
    return GymkhanaEvent.findById(id)
      .populate("calendarId", "academicYear")
      .populate("megaEventSeriesId", "name description")
      .populate("proposalId")
      .populate("expenseId")
  },

  /** Standard (non-mega) events of a calendar (calendar-sync diff base). */
  async findCalendarEvents(calendarId) {
    return GymkhanaEvent.find({ calendarId, isMegaEvent: false })
  },

  /** Standard events of a calendar, soonest first (calendar event load). */
  async findCalendarEventsSorted(calendarId) {
    return GymkhanaEvent.find({ calendarId, isMegaEvent: false }).sort({ scheduledStartDate: 1 })
  },

  /** Events needing proposals, by proposalDueDate (GS dashboard; caller builds filter). */
  async findEventsNeedingProposals(filter) {
    return GymkhanaEvent.find(filter).sort({ proposalDueDate: 1 })
  },

  /** Paginated events with calendar/series names (controller getEvents). */
  async listEvents(filter = {}, { skip = 0, limit = 20 } = {}) {
    return GymkhanaEvent.find(filter)
      .populate("calendarId", "academicYear")
      .populate("megaEventSeriesId", "name")
      .sort({ scheduledStartDate: 1 })
      .skip(skip)
      .limit(limit)
  },

  /** Count events matching a filter (controller getEvents pagination). */
  async countEvents(filter = {}) {
    return GymkhanaEvent.countDocuments(filter)
  },

  /** Calendar-view events: compact projection, soonest first (controller getCalendarView). */
  async findEventsForCalendarView(filter) {
    return GymkhanaEvent.find(filter)
      .select("title category scheduledStartDate scheduledEndDate status proposalDueDate")
      .sort({ scheduledStartDate: 1 })
  },
}

export default gymkhanaEventQueries
