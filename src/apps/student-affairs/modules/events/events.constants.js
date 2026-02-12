/**
 * @fileoverview Events Module Constants
 * @description Constants for events management in Student Affairs
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const CALENDAR_STATUS = {
  DRAFT: "draft",
  PENDING_PRESIDENT: "pending_president",
  PENDING_STUDENT_AFFAIRS: "pending_student_affairs",
  PENDING_JOINT_REGISTRAR: "pending_joint_registrar",
  PENDING_ASSOCIATE_DEAN: "pending_associate_dean",
  PENDING_DEAN: "pending_dean",
  APPROVED: "approved",
  REJECTED: "rejected",
}

export const EVENT_STATUS = {
  UPCOMING: "upcoming",
  PROPOSAL_PENDING: "proposal_pending",
  PROPOSAL_SUBMITTED: "proposal_submitted",
  PROPOSAL_APPROVED: "proposal_approved",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
}

export const PROPOSAL_STATUS = {
  DRAFT: "draft",
  PENDING_PRESIDENT: "pending_president",
  PENDING_STUDENT_AFFAIRS: "pending_student_affairs",
  PENDING_JOINT_REGISTRAR: "pending_joint_registrar",
  PENDING_ASSOCIATE_DEAN: "pending_associate_dean",
  PENDING_DEAN: "pending_dean",
  APPROVED: "approved",
  REJECTED: "rejected",
  REVISION_REQUESTED: "revision_requested",
}

export const AMENDMENT_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
}

export const EXPENSE_APPROVAL_STATUS = {
  PENDING_STUDENT_AFFAIRS: "pending_student_affairs",
  PENDING_JOINT_REGISTRAR: "pending_joint_registrar",
  PENDING_ASSOCIATE_DEAN: "pending_associate_dean",
  PENDING_DEAN: "pending_dean",
  APPROVED: "approved",
  REJECTED: "rejected",
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPROVAL CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const APPROVAL_STAGES = {
  GS_GYMKHANA: "GS Gymkhana",
  PRESIDENT_GYMKHANA: "President Gymkhana",
  STUDENT_AFFAIRS: "Student Affairs",
  JOINT_REGISTRAR_SA: "Joint Registrar SA",
  ASSOCIATE_DEAN_SA: "Associate Dean SA",
  DEAN_SA: "Dean SA",
}

export const APPROVAL_ORDER = [
  APPROVAL_STAGES.GS_GYMKHANA,
  APPROVAL_STAGES.PRESIDENT_GYMKHANA,
  APPROVAL_STAGES.STUDENT_AFFAIRS,
  APPROVAL_STAGES.JOINT_REGISTRAR_SA,
  APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
  APPROVAL_STAGES.DEAN_SA,
]

export const POST_STUDENT_AFFAIRS_APPROVERS = [
  APPROVAL_STAGES.JOINT_REGISTRAR_SA,
  APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
  APPROVAL_STAGES.DEAN_SA,
]

// Map from stage to next pending status
export const STAGE_TO_STATUS = {
  [APPROVAL_STAGES.GS_GYMKHANA]: "pending_president",
  [APPROVAL_STAGES.PRESIDENT_GYMKHANA]: "pending_student_affairs",
  [APPROVAL_STAGES.STUDENT_AFFAIRS]: "pending_joint_registrar",
  [APPROVAL_STAGES.JOINT_REGISTRAR_SA]: "pending_associate_dean",
  [APPROVAL_STAGES.ASSOCIATE_DEAN_SA]: "pending_dean",
  [APPROVAL_STAGES.DEAN_SA]: "approved",
}

// Map from status to required subrole for approval
export const STATUS_TO_APPROVER = {
  pending: APPROVAL_STAGES.STUDENT_AFFAIRS,
  pending_president: APPROVAL_STAGES.PRESIDENT_GYMKHANA,
  pending_student_affairs: APPROVAL_STAGES.STUDENT_AFFAIRS,
  pending_joint_registrar: APPROVAL_STAGES.JOINT_REGISTRAR_SA,
  pending_associate_dean: APPROVAL_STAGES.ASSOCIATE_DEAN_SA,
  pending_dean: APPROVAL_STAGES.DEAN_SA,
}

export const APPROVER_TO_STATUS = {
  [APPROVAL_STAGES.PRESIDENT_GYMKHANA]: "pending_president",
  [APPROVAL_STAGES.STUDENT_AFFAIRS]: "pending_student_affairs",
  [APPROVAL_STAGES.JOINT_REGISTRAR_SA]: "pending_joint_registrar",
  [APPROVAL_STAGES.ASSOCIATE_DEAN_SA]: "pending_associate_dean",
  [APPROVAL_STAGES.DEAN_SA]: "pending_dean",
}

export const APPROVAL_ACTIONS = {
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  REVISION_REQUESTED: "revision_requested",
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const EVENT_CATEGORY = {
  ACADEMIC: "academic",
  CULTURAL: "cultural",
  TECHNICAL: "technical",
  SPORTS: "sports",
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const PROPOSAL_DUE_DAYS = 21 // Days before event when proposal is due
