/**
 * Mega Event Queries Service
 * --------------------------
 * The single READ surface for the MegaEventSeries and MegaEventOccurrence
 * collections. The mega-events app service reads through these instead of
 * importing the models, so they are touched only inside
 * `src/services/gymkhana/` (writes live in megaEventOwner.service.js).
 *
 * populate/select/sort choices mirror each original caller EXACTLY. All reads
 * return HYDRATED docs (callers call .toObject()/.save() and read virtuals).
 */

import { MegaEventSeries, MegaEventOccurrence } from "../../models/index.js"

const OCCURRENCE_DATE_SORT = { scheduledStartDate: -1, scheduledEndDate: -1, createdAt: -1 }

export const megaEventQueries = {
  // ---- MegaEventSeries ----

  /** Active series, alphabetical (series listing). */
  async listActiveSeries() {
    return MegaEventSeries.find({ isActive: true }).sort({ name: 1 })
  },

  /** Series by exact name (duplicate-name guard on create). */
  async findSeriesByName(name) {
    return MegaEventSeries.findOne({ name })
  },

  /** Series by id (hydrated). */
  async findSeriesById(seriesId) {
    return MegaEventSeries.findById(seriesId)
  },

  // ---- MegaEventOccurrence ----

  /** Occurrence by id (hydrated — used for mutate-then-persist and reads). */
  async findOccurrenceById(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
  },

  /** Latest occurrence summary for a series (series list card). */
  async findLatestOccurrenceSummaryBySeries(seriesId) {
    return MegaEventOccurrence.findOne({ seriesId })
      .sort(OCCURRENCE_DATE_SORT)
      .select("title status scheduledStartDate scheduledEndDate proposalSubmitted proposalDueDate")
  },

  /** Count of occurrences in a series. */
  async countOccurrencesBySeries(seriesId) {
    return MegaEventOccurrence.countDocuments({ seriesId })
  },

  /** Occurrences whose embedded proposal is at a given status (approval queue). */
  async findOccurrencesByProposalStatus(status) {
    return MegaEventOccurrence.find({ "proposal.status": status })
      .select("title seriesId scheduledStartDate scheduledEndDate proposal.status")
      .populate("seriesId", "name")
      .sort({ scheduledStartDate: -1, createdAt: -1 })
  },

  /** All occurrences of a series, newest first (series detail). */
  async findOccurrencesBySeries(seriesId) {
    return MegaEventOccurrence.find({ seriesId }).sort(OCCURRENCE_DATE_SORT)
  },

  /** Occurrence by id with proposal actor refs populated (proposal detail). */
  async findOccurrenceByIdWithProposalRefs(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
      .populate("proposal.submittedBy", "name email subRole")
      .populate("proposal.rejectedBy", "name email subRole")
  },

  /** Occurrence by id with proposal history actors populated. */
  async findOccurrenceByIdWithProposalHistory(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
      .populate("proposal.history.performedBy", "name email subRole")
  },

  /** Occurrence by id with expense actor refs populated (expense detail). */
  async findOccurrenceByIdWithExpenseRefs(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
      .populate("expense.submittedBy", "name email subRole")
      .populate("expense.approvedBy", "name email subRole")
      .populate("expense.rejectedBy", "name email subRole")
  },

  /** Occurrence by id with expense history actors populated. */
  async findOccurrenceByIdWithExpenseHistory(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
      .populate("expense.history.performedBy", "name email subRole")
  },
}

export default megaEventQueries
