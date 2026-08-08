/**
 * Event Proposal Queries Service
 * ------------------------------
 * The single READ surface for the EventProposal collection. The proposal and
 * expense app-services read through these instead of importing the model, so
 * EventProposal is touched only inside `src/services/gymkhana/` (writes live in
 * eventProposalOwner.service.js).
 *
 * SOFT DELETE: the model has a pre(/^find/) guard that hides isDeleted docs
 * unless the filter names `isDeleted` or the query sets { withDeleted: true }.
 * These methods preserve that exactly — bare finds hide deleted;
 * findProposalByIdWithDeleted opts in via setOptions; listDeletedProposals
 * filters on isDeleted. populate/lean choices mirror each caller EXACTLY.
 */

import { EventProposal } from "../../models/index.js"

export const eventProposalQueries = {
  /** Proposal by id (hydrated; hides soft-deleted — mutate-then-persist + reads). */
  async findProposalById(id) {
    return EventProposal.findById(id)
  },

  /** Proposal by id INCLUDING soft-deleted (admin restore). */
  async findProposalByIdWithDeleted(id) {
    return EventProposal.findOne({ _id: id }).setOptions({ withDeleted: true })
  },

  /** Proposal by id with event + actor refs populated (detail view). */
  async findProposalByIdDetailed(id) {
    return EventProposal.findById(id)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email")
  },

  /** Proposal for an event, populated (get-by-event). */
  async findProposalByEventPopulated(eventId) {
    return EventProposal.findOne({ eventId })
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email")
  },

  /** Soft-deleted proposals, newest-deleted first (admin deleted-items view). */
  async listDeletedProposals({ limit = 200 } = {}) {
    return EventProposal.find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(limit)
      .populate("submittedBy", "name email")
      .populate("deletedBy", "name email")
      .populate("eventId", "title category")
      .lean()
  },

  /**
   * Proposals awaiting the current approver, newest first. The caller builds
   * the full query (status filter + currentApproverUser $or), we run it with
   * the standard populates/sort.
   */
  async findProposalsForApproval(queryObj) {
    return EventProposal.find(queryObj)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .sort({ createdAt: -1 })
  },
}

export default eventProposalQueries
