/**
 * @fileoverview Approval email helpers
 * @description Sends stage notification emails to the people who must recommend/
 * approve an item, and notifies the submitter when an item is rejected or sent
 * back for revision. Emails include a role-appropriate deep link straight to the
 * relevant review modal.
 */

import { userQueries } from "../../../../services/user/userQueries.service.js"
import logger from "../../../../services/base/Logger.js"
import { emailService } from "../../../../services/email/index.js"
import { env } from "../../../../config/env.config.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"

const ENTITY_TYPE_LABELS = {
  ActivityCalendar: "Activity Calendar",
  EventProposal: "Event Proposal",
  EventExpense: "Event Bills",
  PorRequest: "POR Request",
}

// Which role holds each approval sub-role (used to find recipients for stages
// that aren't assigned to a specific user).
const STAGE_ROLE = {
  "GS Gymkhana": ROLES.GYMKHANA,
  "President Gymkhana": ROLES.GYMKHANA,
  "Student Affairs": ROLES.ADMIN,
  "Officer SA": ROLES.ADMIN,
  "Associate Dean SA": ROLES.ADMIN,
  "Dean SA": ROLES.ADMIN,
}

const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const portalForRole = (role) => {
  if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) return "admin"
  if (role === ROLES.GYMKHANA) return "gymkhana"
  if (role === ROLES.STUDENT) return "student"
  return "admin"
}

const buildQuery = (params = {}) =>
  new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString()

/**
 * Build a deep link to the exact review modal for the recipient's portal.
 * Mirrors the frontend URL scheme (see GymkhanaEventsPage / MegaEventsPage / PorRequestsPage).
 */
export const buildApprovalDeepLink = (recipientRole, entityType, params = {}) => {
  const base = String(env.FRONTEND_URL || "").replace(/\/+$/, "")
  if (!base) return ""
  const portal = portalForRole(recipientRole)
  const eventsSeg = portal === "admin" ? "gymkhana-events" : "events"

  switch (entityType) {
    case "ActivityCalendar":
      return `${base}/${portal}/${eventsSeg}?${buildQuery({ year: params.academicYear, review: "calendar" })}`
    case "EventProposal":
      if (params.isMegaEvent) {
        return `${base}/${portal}/mega-events?${buildQuery({ series: params.seriesId, occurrence: params.occurrenceId, review: "proposal" })}`
      }
      return `${base}/${portal}/${eventsSeg}?${buildQuery({ year: params.academicYear, review: "proposal", event: params.eventId })}`
    case "EventExpense":
      if (params.isMegaEvent) {
        return `${base}/${portal}/mega-events?${buildQuery({ series: params.seriesId, occurrence: params.occurrenceId, review: "expense" })}`
      }
      return `${base}/${portal}/${eventsSeg}?${buildQuery({ year: params.academicYear, review: "expense", event: params.eventId })}`
    case "PorRequest":
      return `${base}/${portal}/por?${buildQuery({ request: params.requestId })}`
    default:
      return `${base}/${portal}`
  }
}

const ctaButton = (link, label) =>
  link ? `<p style="margin-top:18px;"><a href="${link}" class="button">${escapeHtml(label)}</a></p>` : ""

/**
 * Notify the user(s) who must recommend/approve an item at its current stage.
 * If `assignedUserId` is set, only that user is notified; otherwise every user
 * holding the stage's sub-role is notified. Each recipient gets a deep link for
 * their own portal.
 */
export const notifyStageApprovers = async ({
  entityType,
  entityId,
  entityLabel,
  stage,
  assignedUserId = null,
  linkParams = {},
  movedBy = "",
  movedByStage = "",
  comments = "",
}) => {
  if (!stage) {
    return { success: false, skipped: true, reason: "missing_stage" }
  }

  try {
    let recipients = []
    if (assignedUserId) {
      const assigned = await userQueries.findUserById(assignedUserId, { select: "name email role subRole" })
      if (assigned) recipients = [assigned]
    } else {
      const role = STAGE_ROLE[stage]
      if (role) {
        recipients = await userQueries.findUsers({ role, subRole: stage }, { select: "name email role subRole" })
      }
    }
    recipients = recipients.filter((recipient) => recipient?.email)

    if (recipients.length === 0) {
      return { success: false, skipped: true, reason: "no_recipients" }
    }

    const entityTypeLabel = ENTITY_TYPE_LABELS[entityType] || "Approval Item"
    const safeEntityLabel = escapeHtml(entityLabel || entityTypeLabel)
    const safeStage = escapeHtml(stage)
    const safeMovedBy = escapeHtml(movedBy || "")
    const safeMovedByStage = escapeHtml(movedByStage || "")
    const safeComments = escapeHtml(comments || "")
    const subject = `Approval required: ${entityTypeLabel} - ${entityLabel || entityId}`
    const movedBlock = safeMovedBy
      ? `<p><strong>Forwarded by:</strong> ${safeMovedBy}${safeMovedByStage ? ` (${safeMovedByStage})` : ""}</p>`
      : ""
    const commentsBlock = safeComments
      ? `<p><strong>Comments:</strong><br />${safeComments}</p>`
      : ""

    let sent = 0
    for (const recipient of recipients) {
      const link = buildApprovalDeepLink(recipient.role, entityType, linkParams)
      const body = `
        <p>Dear ${escapeHtml(recipient.name || "Approver")},</p>
        <p>A ${escapeHtml(entityTypeLabel)} is awaiting your review at the <strong>${safeStage}</strong> stage in SMS.</p>
        <p><strong>Item:</strong> ${safeEntityLabel}</p>
        ${movedBlock}${commentsBlock}
        ${ctaButton(link, "Review & Approve") || "<p>Please log in to SMS to review this item.</p>"}
      `
      const result = await emailService.sendCustomEmail({ to: recipient.email, subject, body, useTemplate: true })
      if (result?.success) sent += 1
    }

    return { success: sent > 0, count: sent }
  } catch (error) {
    logger.error("Error sending stage approver emails", {
      entityType,
      entityId: String(entityId || ""),
      stage,
      error: error?.message || "Unknown error",
    })
    return { success: false, error: error?.message || "Failed to send email" }
  }
}

/**
 * Notify the original submitter when their item is rejected or sent back for revision.
 */
export const notifySubmitterByEmail = async ({
  entityType,
  entityId,
  entityLabel,
  submitterUserId,
  action, // "rejected" | "revision_requested"
  actorName = "",
  actorStage = "",
  comments = "",
  linkParams = {},
}) => {
  if (!submitterUserId) {
    return { success: false, skipped: true, reason: "missing_submitter" }
  }

  try {
    const submitter = await userQueries.findUserById(submitterUserId, { select: "name email role subRole" })
    if (!submitter?.email) {
      return { success: false, skipped: true, reason: "missing_email" }
    }

    const entityTypeLabel = ENTITY_TYPE_LABELS[entityType] || "Approval Item"
    const isReject = action === "rejected"
    const verb = isReject ? "rejected" : "sent back for revision"
    const subject = `${entityTypeLabel} ${isReject ? "rejected" : "needs changes"}: ${entityLabel || entityId}`
    const link = buildApprovalDeepLink(submitter.role, entityType, linkParams)
    const safeComments = escapeHtml(comments || "")
    const commentsBlock = safeComments
      ? `<p><strong>${isReject ? "Reason" : "Requested changes"}:</strong><br />${safeComments}</p>`
      : ""

    const body = `
      <p>Dear ${escapeHtml(submitter.name || "")},</p>
      <p>Your ${escapeHtml(entityTypeLabel)} <strong>${escapeHtml(entityLabel || "")}</strong> has been ${verb}${actorName ? ` by ${escapeHtml(actorName)}${actorStage ? ` (${escapeHtml(actorStage)})` : ""}` : ""}.</p>
      ${commentsBlock}
      ${ctaButton(link, isReject ? "View details" : "Open & update")}
    `

    const result = await emailService.sendCustomEmail({ to: submitter.email, subject, body, useTemplate: true })
    return { success: Boolean(result?.success) }
  } catch (error) {
    logger.error("Error sending submitter email", {
      entityType,
      entityId: String(entityId || ""),
      error: error?.message || "Unknown error",
    })
    return { success: false, error: error?.message || "Failed to send email" }
  }
}
