/**
 * Audit Service
 *
 * Generic, reusable recorder + reader for the AuditLog system. Any feature can
 * call `recordCreate / recordUpdate / recordDelete` from its mutation sites to
 * capture who changed what (and optionally why). `getEntityHistory` fuses the
 * data-mutation log (AuditLog) with the approval-workflow log (ApprovalLog) into
 * one chronological timeline for the admin popup — this read-side merge is the
 * ONLY place the two systems meet; their storage stays fully decoupled.
 *
 * Write semantics:
 * - Best-effort by default: a logging failure is reported but never throws, so
 *   it can never break the user-facing action it accompanies (matches the
 *   existing ApprovalLog.create pattern).
 * - Pass a Mongoose `session` to make the write participate in a transaction
 *   (e.g. for financial edits); in that mode failures propagate so the whole
 *   transaction rolls back.
 */

import AuditLog from "../../models/audit/AuditLog.model.js"
import ApprovalLog from "../../models/event/ApprovalLog.model.js"
import { computeDiff } from "../../utils/objectDiff.js"
import { success } from "../base/ServiceResponse.js"
import { logger } from "../base/Logger.js"

/**
 * Normalize an actor from a req.user-like object. Pass null/undefined for an
 * automated/system change.
 */
export const actorFromUser = (user) => {
  if (!user || !user._id) {
    return { userId: null, role: null, subRole: null, isSystem: true }
  }
  return {
    userId: user._id,
    role: user.role || null,
    subRole: user.subRole || null,
    isSystem: false,
  }
}

class AuditService {
  /**
   * Low-level append. Returns the created doc, or null on a swallowed failure.
   * @private
   */
  async _record({ session, ...payload }) {
    try {
      const opts = session ? { session } : {}
      const [doc] = await AuditLog.create([payload], opts)
      return doc
    } catch (err) {
      if (session) throw err // transactional caller wants rollback
      logger?.error?.(
        `[audit] failed to record ${payload.action} on ${payload.entityType}:${payload.entityId} - ${err.message}`
      )
      return null
    }
  }

  /**
   * Record a creation. `snapshot` should be the tracked content fields of the
   * newly created entity.
   */
  recordCreate({ entityType, entityId, snapshot = null, actor, reason = null, feature = null, context = null, session = null }) {
    return this._record({
      entityType,
      entityId,
      action: "create",
      snapshot,
      actor: actorFromUser(actor),
      reason,
      feature,
      context,
      session,
    })
  }

  /**
   * Record an update. Computes the field-level diff from `before`/`after`
   * snapshots. If nothing tracked actually changed, no record is written and
   * null is returned.
   *
   * @param {object} p
   * @param {string[]} [p.fields] - Fields to compare; defaults to the union of
   *   keys in `before`/`after`.
   */
  recordUpdate({ entityType, entityId, before, after, fields = null, actor, reason = null, feature = null, context = null, session = null }) {
    const changes = computeDiff(before, after, fields)
    if (!changes.length) return Promise.resolve(null)
    return this._record({
      entityType,
      entityId,
      action: "update",
      changes,
      actor: actorFromUser(actor),
      reason,
      feature,
      context,
      session,
    })
  }

  /**
   * Record a deletion. `snapshot` should be the tracked fields of the entity as
   * it existed just before deletion.
   */
  recordDelete({ entityType, entityId, snapshot = null, actor, reason = null, feature = null, context = null, session = null }) {
    return this._record({
      entityType,
      entityId,
      action: "delete",
      snapshot,
      actor: actorFromUser(actor),
      reason,
      feature,
      context,
      session,
    })
  }

  /**
   * Record a restore (un-delete). `snapshot` should be the tracked fields of the
   * entity as it exists after being restored.
   */
  recordRestore({ entityType, entityId, snapshot = null, actor, reason = null, feature = null, context = null, session = null }) {
    return this._record({
      entityType,
      entityId,
      action: "restore",
      snapshot,
      actor: actorFromUser(actor),
      reason,
      feature,
      context,
      session,
    })
  }

  /**
   * Merged, newest-first timeline for one entity: AuditLog edits + ApprovalLog
   * workflow events, normalized to a common shape. Paginated in memory (per-
   * entity timelines are bounded).
   */
  async getEntityHistory({ entityType, entityId, page = 1, limit = 50 }) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 50, 200))

    const [audits, approvals] = await Promise.all([
      AuditLog.find({ entityType, entityId })
        .populate("actor.userId", "name email role")
        .lean(),
      ApprovalLog.find({ entityType, entityId })
        .populate("performedBy", "name email role")
        .lean(),
    ])

    const editItems = audits.map((a) => ({
      kind: "edit",
      id: a._id,
      action: a.action,
      actor: normalizeAuditActor(a.actor),
      reason: a.reason || null,
      changes: a.changes || [],
      snapshot: a.snapshot ?? null,
      feature: a.feature || null,
      at: a.createdAt,
    }))

    const approvalItems = approvals.map((p) => ({
      kind: "approval",
      id: p._id,
      action: p.action,
      stage: p.stage,
      actor: normalizePopulatedUser(p.performedBy),
      comments: p.comments || null,
      attachments: p.attachments || [],
      at: p.createdAt,
    }))

    const items = [...editItems, ...approvalItems].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    )

    const total = items.length
    const start = (pageNum - 1) * limitNum
    const pageItems = items.slice(start, start + limitNum)

    return success({
      items: pageItems,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasMore: pageNum * limitNum < total,
      },
    })
  }
}

/** Shape a populated User ref (or null) into the timeline actor shape. */
const normalizePopulatedUser = (user) => {
  if (!user) return { id: null, name: "System", role: null, isSystem: true }
  return {
    id: user._id,
    name: user.name || null,
    role: user.role || null,
    isSystem: false,
  }
}

/** Shape an AuditLog embedded actor (with possibly-populated userId). */
const normalizeAuditActor = (actor) => {
  if (!actor || actor.isSystem || !actor.userId) {
    return { id: null, name: "System", role: actor?.role || null, isSystem: true }
  }
  const populated = actor.userId
  // userId is populated to a User doc when present; fall back to the snapshot role.
  if (populated && typeof populated === "object") {
    return {
      id: populated._id,
      name: populated.name || null,
      role: populated.role || actor.role || null,
      subRole: actor.subRole || null,
      isSystem: false,
    }
  }
  return { id: populated, name: null, role: actor.role || null, subRole: actor.subRole || null, isSystem: false }
}

export const auditService = new AuditService()
export default auditService
