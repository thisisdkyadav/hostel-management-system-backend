/**
 * Approval Log Owner Service
 * --------------------------
 * The single WRITE surface for the ApprovalLog collection — the append-only
 * audit trail for approvals/rejections across ActivityCalendar, EventProposal,
 * CalendarAmendment, EventExpense and PorRequest. Every write goes through here
 * so the model is mutated only inside `src/services/gymkhana/` (reads live in
 * approvalLogQueries.service.js).
 *
 * Shared by the gymkhana event workflow AND the POR workflow (both append
 * PorRequest/entity logs).
 */

import { ApprovalLog } from "../../models/index.js"

export const approvalLogOwner = {
  /** Append an approval-log entry. Returns the created doc. */
  async createLog(data) {
    return ApprovalLog.create(data)
  },
}

export default approvalLogOwner
