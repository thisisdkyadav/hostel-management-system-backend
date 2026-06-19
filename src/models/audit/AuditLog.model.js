/**
 * Audit Log Model
 *
 * Generic, append-only record of data mutations (create/update/delete/restore)
 * on any entity, across any feature. This is intentionally decoupled from the
 * approval-workflow log (ApprovalLog): AuditLog captures *what data changed*
 * (field-level diffs, who, when, and optionally why), while ApprovalLog captures
 * *workflow transitions* (submitted/approved/rejected).
 *
 * Design notes:
 * - `entityType` is a free string (NOT an enum and NOT a refPath) so any feature
 *   can log without editing this model. Reuse the same string values that other
 *   systems use (e.g. "EventProposal", "EventExpense") to make read-side merges
 *   trivial, but no schema-level coupling is introduced.
 * - Records are meant to be immutable / append-only. Never update or delete them.
 */

import mongoose from "mongoose"

const ChangeSchema = new mongoose.Schema(
  {
    field: { type: String, required: true },
    from: { type: mongoose.Schema.Types.Mixed, default: null },
    to: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

const ActorSchema = new mongoose.Schema(
  {
    // Null when the change was made by an automated/system process.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Role snapshotted at the time of the change (the user's role may change later).
    role: { type: String, default: null },
    subRole: { type: String, default: null },
    isSystem: { type: Boolean, default: false },
  },
  { _id: false }
)

const AuditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true, trim: true },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action: {
      type: String,
      enum: ["create", "update", "delete", "restore"],
      required: true,
    },
    // Field-level diff. Populated for "update" (and "restore" when applicable).
    changes: { type: [ChangeSchema], default: [] },
    // Full snapshot of tracked fields. Populated for "create" and "delete".
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    actor: { type: ActorSchema, default: () => ({}) },
    // Optional justification — typically present only for admin/staff overrides.
    reason: { type: String, trim: true, default: null },
    // Optional feature/group tag for filtering (e.g. "gymkhana-events").
    feature: { type: String, trim: true, default: null },
    // Freeform request context (ip, requestId, source, etc.).
    context: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Primary read path: full timeline for one entity, newest first.
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
// Secondary reads: everything a given actor changed.
AuditLogSchema.index({ "actor.userId": 1, createdAt: -1 })
// Feature-scoped browsing.
AuditLogSchema.index({ feature: 1, createdAt: -1 })

const AuditLog = mongoose.model("AuditLog", AuditLogSchema)

export default AuditLog
