/**
 * Accommodation module constants.
 */

import { ROLES } from "../../../../core/constants/roles.constants.js"

// Approval-chain stage ids.
export const STAGE = {
  CW_OFFICE_CAPACITY: "cwOfficeCapacity",
  FACULTY_ADVISOR: "facultyAdvisor",
  CHIEF_WARDEN: "chiefWarden",
}

// Chief Warden decision actions (request param / body). The Chief Warden Office
// capacity screening uses the same three.
export const CW_DECISION = {
  APPROVE: "approve",
  REQUEST_MODIFICATION: "request_modification",
  REJECT: "reject",
}

// Guest days run 11:00 → 11:00; anything outside is a requested extension.
export const STANDARD_CHECK_HOUR = 11
export const STANDARD_CHECK_TIME = "11:00"
export const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

// UTR of an NEFT/IMPS/UPI transfer — always 12 numeric digits.
export const UTR_RE = /^\d{12}$/

// Faculty advisor (token) decisions.
export const FA_DECISION = {
  RECOMMEND: "recommend",
  DECLINE: "decline",
}

// Accountant payment-verification decisions (on a portal-submitted payment).
export const PAYMENT_DECISION = {
  VERIFY: "verify",
  REJECT: "reject",
}

// Accounts-office overrides for money that never passes through the portal
// (cash/DD at the counter, a bank reconciliation, or fixing a mistake).
export const MANUAL_SETTLEMENT = {
  MARK_PAID: "mark_paid",
  MARK_UNPAID: "mark_unpaid",
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
