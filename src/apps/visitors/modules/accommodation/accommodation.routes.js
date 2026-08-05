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

// Chief Warden Office issues the payment request
router.post(
  "/requests/:requestId/payment-request",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.issuePaymentRequest
)

// Student submits the payment screenshot
router.post(
  "/requests/:requestId/payment",
  guard(["Student"]),
  ctrl.submitPayment
)

// Accountant verifies / rejects the payment
router.post(
  "/requests/:requestId/payment-verify",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.ACCOUNTANT]),
  ctrl.verifyPayment
)

// Chief Warden Office: guest-bed availability across hostels for allotment
router.get(
  "/requests/:requestId/allotment-availability",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.getAllotmentAvailability
)

// Chief Warden Office allots a hostel
router.post(
  "/requests/:requestId/allot",
  guard(["Admin"]),
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.allotHostel
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
