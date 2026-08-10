/**
 * Accommodation workflow state machine.
 * Single source of truth for allowed status transitions. See
 * backend/docs/accommodation-flow.md for the diagram.
 */

import { ACCOMMODATION_STATUS } from "../../../../models/index.js"

const S = ACCOMMODATION_STATUS

export const TRANSITIONS = {
  [S.DRAFT]: [S.SUBMITTED, S.CANCELLED],
  // Every submission is screened for capacity by the Chief Warden Office first.
  [S.SUBMITTED]: [S.PENDING_CWO_CAPACITY, S.CANCELLED],
  [S.PENDING_CWO_CAPACITY]: [
    S.PENDING_FA_RECOMMENDATION,
    S.PENDING_CW_APPROVAL,
    S.RETURNED_TO_STUDENT,
    S.REJECTED,
    S.CANCELLED,
  ],
  [S.PENDING_FA_RECOMMENDATION]: [S.PENDING_CW_APPROVAL, S.RETURNED_TO_STUDENT, S.CANCELLED],
  [S.PENDING_CW_APPROVAL]: [S.CW_APPROVED, S.RETURNED_TO_STUDENT, S.REJECTED, S.CANCELLED],
  [S.RETURNED_TO_STUDENT]: [S.SUBMITTED, S.CANCELLED],
  // CW Office sets the amount and the hostel in one action.
  [S.CW_APPROVED]: [S.PAYMENT_REQUESTED, S.CANCELLED],
  // The student either pays now or defers; both lead to room assignment.
  // PAYMENT_VERIFIED is reachable directly because money taken at the counter
  // never passes through the portal's "submitted" step.
  [S.PAYMENT_REQUESTED]: [S.PAYMENT_SUBMITTED, S.PAYMENT_DEFERRED, S.PAYMENT_VERIFIED, S.CANCELLED],
  // A student cannot pull out once payment is requested, but the office can
  // cancel a booking any time before it is invoiced — the release valve for
  // dropped-out guests and bookings holding rooms they will never use.
  [S.PAYMENT_SUBMITTED]: [S.PAYMENT_VERIFIED, S.PAYMENT_REQUESTED, S.CANCELLED],
  [S.PAYMENT_VERIFIED]: [S.ROOMS_ASSIGNED, S.CANCELLED],
  [S.PAYMENT_DEFERRED]: [S.ROOMS_ASSIGNED, S.CANCELLED],
  [S.HOSTEL_ALLOTTED]: [S.ROOMS_ASSIGNED, S.CANCELLED], // legacy in-flight requests only
  [S.ROOMS_ASSIGNED]: [S.CHECKED_IN, S.INVOICED, S.CANCELLED],
  [S.CHECKED_IN]: [S.CHECKED_OUT, S.INVOICED, S.CANCELLED],
  [S.CHECKED_OUT]: [S.INVOICED, S.CANCELLED],
  [S.INVOICED]: [],
  [S.REJECTED]: [],
  [S.CANCELLED]: [],
}

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to)

// Statuses from which a student may still cancel their own request.
export const CANCELLABLE_STATUSES = [
  S.DRAFT,
  S.SUBMITTED,
  S.PENDING_CWO_CAPACITY,
  S.PENDING_FA_RECOMMENDATION,
  S.PENDING_CW_APPROVAL,
  S.RETURNED_TO_STUDENT,
]

// A deferred bill can be settled from the moment rooms are assigned, and stays
// settleable after the stay closes — the invoice is issued whenever it lands.
export const DEFERRED_PAYABLE_STATUSES = [
  S.ROOMS_ASSIGNED,
  S.CHECKED_IN,
  S.CHECKED_OUT,
  S.INVOICED,
]

// Nothing more happens to a request in one of these.
export const TERMINAL_STATUSES = [S.INVOICED, S.REJECTED, S.CANCELLED]

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
