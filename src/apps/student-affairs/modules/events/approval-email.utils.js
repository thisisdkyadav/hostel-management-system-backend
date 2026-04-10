/**
 * @fileoverview Approval email helpers
 * @description Sends approval-required emails to specifically assigned approvers
 */

import User from "../../../../models/user/User.model.js"
import logger from "../../../../services/base/Logger.js"
import { emailService } from "../../../../services/email/index.js"

const ENTITY_TYPE_LABELS = {
  ActivityCalendar: "Activity Calendar",
  EventProposal: "Event Proposal",
  EventExpense: "Event Bills",
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

export const notifyAssignedApproverByEmail = async ({
  entityType,
  entityId,
  entityLabel,
  nextApproverUserId,
  nextApproverStage,
  approvedBy,
  approvedByStage,
  comments = "",
}) => {
  if (!nextApproverUserId || !nextApproverStage) {
    return { success: false, skipped: true, reason: "missing_target" }
  }

  try {
    const nextApprover = await User.findById(nextApproverUserId).select("name email subRole")
    if (!nextApprover?.email) {
      return { success: false, skipped: true, reason: "missing_email" }
    }

    const entityTypeLabel = ENTITY_TYPE_LABELS[entityType] || "Approval Item"
    const safeEntityLabel = escapeHtml(entityLabel || entityTypeLabel)
    const safeApproverName = escapeHtml(nextApprover.name || "Approver")
    const safeApprovedBy = escapeHtml(approvedBy || "Previous approver")
    const safeApprovedByStage = escapeHtml(approvedByStage || "Approval Stage")
    const safeNextStage = escapeHtml(nextApproverStage)
    const safeComments = escapeHtml(comments || "")

    const subject = `Approval required: ${entityTypeLabel} - ${entityLabel || entityId}`
    const commentsBlock = safeComments
      ? `<p><strong>Comments from previous approver:</strong><br />${safeComments}</p>`
      : ""

    const body = `
      <p>Dear ${safeApproverName},</p>
      <p>You have been selected as the next approver for a ${escapeHtml(entityTypeLabel)} in HMS.</p>
      <p><strong>Item:</strong> ${safeEntityLabel}</p>
      <p><strong>Your approval stage:</strong> ${safeNextStage}</p>
      <p><strong>Moved to you by:</strong> ${safeApprovedBy} (${safeApprovedByStage})</p>
      ${commentsBlock}
      <p>Please log in to HMS and review this item from the Gymkhana events approval section.</p>
    `

    const result = await emailService.sendCustomEmail({
      to: nextApprover.email,
      subject,
      body,
      useTemplate: true,
    })

    if (!result?.success) {
      logger.error("Failed to send assigned approver email", {
        entityType,
        entityId: String(entityId || ""),
        nextApproverUserId: String(nextApproverUserId),
        nextApproverStage,
        error: result?.error || "Unknown email error",
      })
      return { success: false, error: result?.error || "Failed to send email" }
    }

    return { success: true }
  } catch (error) {
    logger.error("Error sending assigned approver email", {
      entityType,
      entityId: String(entityId || ""),
      nextApproverUserId: String(nextApproverUserId),
      nextApproverStage,
      error: error?.message || "Unknown error",
    })
    return { success: false, error: error?.message || "Failed to send email" }
  }
}

