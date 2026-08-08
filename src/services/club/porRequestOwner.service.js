/**
 * POR Request Owner Service
 * -------------------------
 * The single WRITE surface for the PorRequest collection (student position-of-
 * responsibility requests moving through the gymkhana → student-affairs
 * approval chain). Every create/persist goes through here so the model is
 * mutated only inside `src/services/club/` (reads live in
 * porRequestQueries.service.js).
 *
 * Requests are fetched hydrated by the caller, mutated in place (status /
 * approval-chain transitions, legacy migration), then persisted via
 * persistRequest. No pre-save hooks. Approval-log writes go through
 * approvalLogOwner (see [[events-owner]]); ApprovalLog is shared with the
 * gymkhana workflow.
 */

import { PorRequest } from "../../models/index.js"

export const porRequestOwner = {
  /** Create a POR request. Returns the created doc. */
  async createRequest(data) {
    return PorRequest.create(data)
  },

  /** Persist a hydrated POR request doc mutated by the caller. Returns the doc. */
  async persistRequest(porRequest) {
    return porRequest.save()
  },
}

export default porRequestOwner
