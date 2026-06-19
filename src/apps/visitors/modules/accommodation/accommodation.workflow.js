/**
 * Accommodation workflow state machine.
 * Single source of truth for allowed status transitions. See
 * backend/docs/accommodation-flow.md for the diagram.
 */

import { ACCOMMODATION_STATUS } from "../../../../models/index.js"

const S = ACCOMMODATION_STATUS

export const TRANSITIONS = {
  [S.DRAFT]: [S.SUBMITTED, S.CANCELLED],
  [S.SUBMITTED]: [S.PENDING_FA_RECOMMENDATION, S.PENDING_CW_APPROVAL, S.CANCELLED],
  [S.PENDING_FA_RECOMMENDATION]: [S.PENDING_CW_APPROVAL, S.RETURNED_TO_STUDENT, S.CANCELLED],
  [S.PENDING_CW_APPROVAL]: [S.CW_APPROVED, S.RETURNED_TO_STUDENT, S.REJECTED, S.CANCELLED],
  [S.RETURNED_TO_STUDENT]: [S.SUBMITTED, S.CANCELLED],
  [S.CW_APPROVED]: [S.PAYMENT_REQUESTED, S.CANCELLED],
  [S.PAYMENT_REQUESTED]: [S.PAYMENT_SUBMITTED, S.CANCELLED],
  [S.PAYMENT_SUBMITTED]: [S.PAYMENT_VERIFIED, S.PAYMENT_REQUESTED],
  [S.PAYMENT_VERIFIED]: [S.HOSTEL_ALLOTTED],
  [S.HOSTEL_ALLOTTED]: [S.ROOMS_ASSIGNED],
  [S.ROOMS_ASSIGNED]: [S.CHECKED_IN, S.INVOICED],
  [S.CHECKED_IN]: [S.CHECKED_OUT, S.INVOICED],
  [S.CHECKED_OUT]: [S.INVOICED],
  [S.INVOICED]: [],
  [S.REJECTED]: [],
  [S.CANCELLED]: [],
}

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to)

// Statuses from which a student may still cancel their own request.
export const CANCELLABLE_STATUSES = [
  S.DRAFT,
  S.SUBMITTED,
  S.PENDING_FA_RECOMMENDATION,
  S.PENDING_CW_APPROVAL,
  S.RETURNED_TO_STUDENT,
]

/**
 * Move a request to `nextStatus` and append a timeline entry.
 * Throws if the transition is not allowed by the state machine.
 */
export const applyStatus = (request, nextStatus, { by = null, note = "" } = {}) => {
  if (!canTransition(request.status, nextStatus)) {
    throw new Error(`Illegal accommodation transition: ${request.status} -> ${nextStatus}`)
  }
  request.status = nextStatus
  request.timeline.push({ status: nextStatus, by, at: new Date(), note })
}
