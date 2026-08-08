/**
 * Approval Log Queries Service
 * ----------------------------
 * The single READ surface for the ApprovalLog collection. The calendar,
 * proposal, expense app-services, the POR app-service and the audit timeline
 * read through these instead of importing the model, so ApprovalLog is touched
 * only inside `src/services/gymkhana/` (writes live in
 * approvalLogOwner.service.js).
 *
 * Two distinct read shapes are preserved verbatim:
 *  - findLogsByEntity: hydrated, oldest-first, performedBy(name/email/subRole)
 *    — the "approval history" endpoints (gymkhana + POR).
 *  - findLogsByEntityLean: lean, unsorted, performedBy(name/email/role)
 *    — the merged audit timeline (sorted in memory by the caller).
 */

import { ApprovalLog } from "../../models/index.js"

export const approvalLogQueries = {
  /** Approval history for an entity, oldest first, actor sub-role populated. */
  async findLogsByEntity(entityType, entityId) {
    return ApprovalLog.find({ entityType, entityId })
      .sort({ createdAt: 1 })
      .populate("performedBy", "name email subRole")
  },

  /** Approval-log entries for an entity, lean, actor role populated (audit timeline). */
  async findLogsByEntityLean(entityType, entityId) {
    return ApprovalLog.find({ entityType, entityId })
      .populate("performedBy", "name email role")
      .lean()
  },
}

export default approvalLogQueries
