/**
 * Accommodation Routes
 * Base path: /api/v1/accommodation
 *
 * Public faculty-advisor token routes are declared before `authenticate`.
 * Authz reuses the visitor route keys (no catalog version bump). Chief Warden
 * actions are additionally gated on the Admin `Chief Warden` sub-role.
 */

import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import { ACCOMMODATION_ROUTE_KEY_BY_ROLE } from "./accommodation.constants.js"
import * as ctrl from "./accommodation.controller.js"

const router = express.Router()

const guard = routeGuard(ACCOMMODATION_ROUTE_KEY_BY_ROLE)

const requireAdminSubRole = (subRoles) => (req, res, next) => {
  if (req?.user?.role !== ROLES.ADMIN || !subRoles.includes(req?.user?.subRole)) {
    return res.status(403).json({ success: false, message: "You do not have access to this action" })
  }
  return next()
}

// ---- Public faculty-advisor token routes (no auth) ----
router.get("/recommendation/:token", ctrl.getRecommendationByToken)
router.post("/recommendation/:token", ctrl.submitRecommendation)

// ---- Authenticated routes ----
router.use(authenticate)

router.get(
  "/types",
  guard(["Student", "Admin"]),
  ctrl.getAccommodationTypes
)
router.post(
  "/quote",
  guard(["Student", "Admin"]),
  ctrl.previewQuote
)

router.get(
  "/requests",
  guard(["Student", "Admin", "Hostel Supervisor", "Hostel Gate"]),
  ctrl.listRequests
)
router.get(
  "/requests/:requestId",
  guard(["Student", "Admin", "Hostel Supervisor", "Hostel Gate"]),
  ctrl.getRequestById
)
// The invoice PDF, for anyone who can already open the request
router.get(
  "/requests/:requestId/invoice",
  guard(["Student", "Admin", "Hostel Supervisor", "Hostel Gate"]),
  ctrl.getInvoiceFile
)
router.post(
  "/requests",
  guard(["Student"]),
  ctrl.submitAccommodationRequest
)
router.post(
  "/requests/:requestId/resubmit",
  guard(["Student"]),
  ctrl.resubmitRequest
)
router.post(
  "/requests/:requestId/cancel",
  guard(["Student"]),
  ctrl.cancelRequest
)

// Chief Warden Office capacity screening — the first gate a request passes
router.post(
  "/requests/:requestId/capacity-decision",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.capacityDecision
)

// Chief Warden approve / request-modification / reject
router.post(
  "/requests/:requestId/decision",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN]),
  ctrl.chiefWardenDecision
)

// Chief Warden / CW Office skip the faculty-advisor stage
router.post(
  "/requests/:requestId/bypass-fa",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN, SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.bypassFacultyAdvisor
)

// Chief Warden Office issues the payment request and allots the hostel
router.post(
  "/requests/:requestId/payment-request",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.issuePaymentRequest
)

// Student submits the payment proof (UTR + date + screenshot)
router.post(
  "/requests/:requestId/payment",
  guard(["Student"]),
  ctrl.submitPayment
)

// Student opts to pay later (rooms only after payment is verified)
router.post(
  "/requests/:requestId/defer-payment",
  guard(["Student"]),
  ctrl.deferPayment
)

// Accountant verifies / rejects the payment
router.post(
  "/requests/:requestId/payment-verify",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.ACCOUNTANT]),
  ctrl.verifyPayment
)

// Accountant corrects UTR / payment date on a submitted or verified payment
router.post(
  "/requests/:requestId/payment-details",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.ACCOUNTANT]),
  ctrl.updatePaymentDetails
)

// Accounts office records money that never went through the portal, or
// corrects a mistake: mark_paid / mark_unpaid
router.post(
  "/requests/:requestId/payment-settle",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.ACCOUNTANT]),
  ctrl.settlePaymentManually
)

// Chief Warden / CW Office cancel a booking the student can no longer withdraw
router.post(
  "/requests/:requestId/admin-cancel",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN, SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.adminCancelRequest
)

// Chief Warden Office: guest-bed availability per hostel — backs both the
// capacity screening and the hostel pick when the payment request is issued
router.get(
  "/requests/:requestId/allotment-availability",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.getAllotmentAvailability
)

// Hostel Supervisor (Guest House Manager): per-room availability + assign rooms
router.get(
  "/requests/:requestId/room-availability",
  guard(["Hostel Supervisor", "Admin"]),
  ctrl.getRoomAvailability
)
router.post(
  "/requests/:requestId/assign-rooms",
  guard(["Hostel Supervisor"]),
  ctrl.assignRooms
)

// Hostel Gate: check-in / check-out (optional)
router.post(
  "/requests/:requestId/checkin",
  guard(["Hostel Gate"]),
  ctrl.checkIn
)
router.post(
  "/requests/:requestId/checkout",
  guard(["Hostel Gate"]),
  ctrl.checkOut
)

export default router
