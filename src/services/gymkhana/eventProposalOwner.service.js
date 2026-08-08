/**
 * Event Proposal Owner Service
 * ----------------------------
 * The single WRITE surface for the EventProposal collection (detailed proposal
 * submitted by GS/President). Every create/persist goes through here so the
 * model is mutated only inside `src/services/gymkhana/` (reads live in
 * eventProposalQueries.service.js).
 *
 * Proposals are fetched hydrated by the caller, mutated in place, then
 * persisted via persistProposal (includes soft-delete flag changes).
 */

import { EventProposal } from "../../models/index.js"

export const eventProposalOwner = {
  /** Create a proposal. Returns the created doc. */
  async createProposal(data) {
    return EventProposal.create(data)
  },

  /** Persist a hydrated proposal doc mutated by the caller. Returns the doc. */
  async persistProposal(proposal) {
    return proposal.save()
  },
}

export default eventProposalOwner
