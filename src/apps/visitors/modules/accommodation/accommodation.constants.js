/**
 * Accommodation module constants.
 */

import { ROLES } from "../../../../core/constants/roles.constants.js"

// Approval-chain stage ids.
export const STAGE = {
  FACULTY_ADVISOR: "facultyAdvisor",
  CHIEF_WARDEN: "chiefWarden",
}

// Chief Warden decision actions (request param / body).
export const CW_DECISION = {
  APPROVE: "approve",
  REQUEST_MODIFICATION: "request_modification",
  REJECT: "reject",
}

// Faculty advisor (token) decisions.
export const FA_DECISION = {
  RECOMMEND: "recommend",
  DECLINE: "decline",
}

// Accountant payment-verification decisions.
export const PAYMENT_DECISION = {
  VERIFY: "verify",
  REJECT: "reject",
}

export const CW_AUTO_APPROVE_HOURS = 24

// Faculty-advisor recommendation links stay valid for two weeks.
export const FA_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000

// Accommodation lives in the visitor domain, so it reuses the existing visitor
// route keys for authz gating — no authz catalog version bump is required.
export const ACCOMMODATION_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.visitors",
  [ROLES.WARDEN]: "route.warden.visitors",
  [ROLES.ASSOCIATE_WARDEN]: "route.associateWarden.visitors",
  [ROLES.HOSTEL_SUPERVISOR]: "route.hostelSupervisor.visitors",
  [ROLES.STUDENT]: "route.student.visitors",
  [ROLES.HOSTEL_GATE]: "route.hostelGate.visitors",
}
