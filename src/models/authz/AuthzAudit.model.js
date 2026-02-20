/**
 * AuthZ audit model
 * Stores immutable audit logs for layer-3 authz updates.
 */

import mongoose from "mongoose"

const AuthzAuditSchema = new mongoose.Schema(
  {
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    targetRole: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["update", "reset"],
      required: true,
      index: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      default: null,
      maxlength: 500,
    },
    beforeOverride: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    afterOverride: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

const AuthzAudit = mongoose.model("AuthzAudit", AuthzAuditSchema)

export default AuthzAudit
