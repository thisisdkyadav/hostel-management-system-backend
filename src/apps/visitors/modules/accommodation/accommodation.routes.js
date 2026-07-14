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
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import { ACCOMMODATION_ROUTE_KEY_BY_ROLE } from "./accommodation.constants.js"
import * as ctrl from "./accommodation.controller.js"

const router = express.Router()

const requireAccommodationRouteAccess = (req, res, next) => {
  const routeKey = ACCOMMODATION_ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  return requireRouteAccess(routeKey)(req, res, next)
}

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
  authorizeRoles(["Student", "Admin"]),
  requireAccommodationRouteAccess,
  ctrl.getAccommodationTypes
)
router.post(
  "/quote",
  authorizeRoles(["Student", "Admin"]),
  requireAccommodationRouteAccess,
  ctrl.previewQuote
)

router.get(
  "/requests",
  authorizeRoles(["Student", "Admin", "Hostel Supervisor", "Hostel Gate"]),
  requireAccommodationRouteAccess,
  ctrl.listRequests
)
router.get(
  "/requests/:requestId",
  authorizeRoles(["Student", "Admin", "Hostel Supervisor", "Hostel Gate"]),
  requireAccommodationRouteAccess,
  ctrl.getRequestById
)
router.post(
  "/requests",
  authorizeRoles(["Student"]),
  requireAccommodationRouteAccess,
  ctrl.submitAccommodationRequest
)
router.post(
  "/requests/:requestId/resubmit",
  authorizeRoles(["Student"]),
  requireAccommodationRouteAccess,
  ctrl.resubmitRequest
)
router.post(
  "/requests/:requestId/cancel",
  authorizeRoles(["Student"]),
  requireAccommodationRouteAccess,
  ctrl.cancelRequest
)

// Chief Warden approve / request-modification / reject
router.post(
  "/requests/:requestId/decision",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN]),
  ctrl.chiefWardenDecision
)

// Chief Warden / CW Office skip the faculty-advisor stage
router.post(
  "/requests/:requestId/bypass-fa",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN, SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.bypassFacultyAdvisor
)

// Chief Warden Office issues the payment request
router.post(
  "/requests/:requestId/payment-request",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.issuePaymentRequest
)

// Student submits the payment screenshot
router.post(
  "/requests/:requestId/payment",
  authorizeRoles(["Student"]),
  requireAccommodationRouteAccess,
  ctrl.submitPayment
)

// Accountant verifies / rejects the payment
router.post(
  "/requests/:requestId/payment-verify",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.ACCOUNTANT]),
  ctrl.verifyPayment
)

// Chief Warden Office: guest-bed availability across hostels for allotment
router.get(
  "/requests/:requestId/allotment-availability",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.getAllotmentAvailability
)

// Chief Warden Office allots a hostel
router.post(
  "/requests/:requestId/allot",
  authorizeRoles(["Admin"]),
  requireAccommodationRouteAccess,
  requireAdminSubRole([SUBROLES.CHIEF_WARDEN_OFFICE]),
  ctrl.allotHostel
)

// Hostel Supervisor (Guest House Manager): per-room availability + assign rooms
router.get(
  "/requests/:requestId/room-availability",
  authorizeRoles(["Hostel Supervisor", "Admin"]),
  requireAccommodationRouteAccess,
  ctrl.getRoomAvailability
)
router.post(
  "/requests/:requestId/assign-rooms",
  authorizeRoles(["Hostel Supervisor"]),
  requireAccommodationRouteAccess,
  ctrl.assignRooms
)

// Hostel Gate: check-in / check-out (optional)
router.post(
  "/requests/:requestId/checkin",
  authorizeRoles(["Hostel Gate"]),
  requireAccommodationRouteAccess,
  ctrl.checkIn
)
router.post(
  "/requests/:requestId/checkout",
  authorizeRoles(["Hostel Gate"]),
  requireAccommodationRouteAccess,
  ctrl.checkOut
)

export default router
