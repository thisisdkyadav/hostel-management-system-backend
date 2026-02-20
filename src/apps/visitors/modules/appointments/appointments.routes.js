/**
 * Appointments Routes
 * Base path: /api/v1/appointments
 */

import express from "express";
import {
  submitPublicAppointment,
  getPublicAppointmentTargets,
  getAdminAppointments,
  getAdminAppointmentById,
  reviewAppointment,
  getMyAppointmentAvailability,
  updateMyAppointmentAvailability,
  getGateAppointments,
  markGateAppointmentEntry,
} from "./appointments.controller.js";
import { authenticate } from "../../../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js";
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js";
import { ROLES } from "../../../../core/constants/index.js";

const router = express.Router();

// Public endpoint: no login required
router.post("/", submitPublicAppointment);
router.get("/public/targets", getPublicAppointmentTargets);

// Protected endpoints
router.use(authenticate);

const APPOINTMENT_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.appointments",
  [ROLES.HOSTEL_GATE]: "route.hostelGate.appointments",
};

const requireAppointmentRouteAccess = (req, res, next) => {
  const routeKey = APPOINTMENT_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: "You do not have access to this route" });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Admin review endpoints (role + sub-role check in service)
router.get("/admin", authorizeRoles([ROLES.ADMIN]), requireAppointmentRouteAccess, getAdminAppointments);
router.get("/admin/me/availability", authorizeRoles([ROLES.ADMIN]), requireAppointmentRouteAccess, getMyAppointmentAvailability);
router.patch("/admin/me/availability", authorizeRoles([ROLES.ADMIN]), requireAppointmentRouteAccess, updateMyAppointmentAvailability);
router.get("/admin/:appointmentId", authorizeRoles([ROLES.ADMIN]), requireAppointmentRouteAccess, getAdminAppointmentById);
router.patch("/admin/:appointmentId/review", authorizeRoles([ROLES.ADMIN]), requireAppointmentRouteAccess, reviewAppointment);

// Hostel Gate operations
router.get("/gate", authorizeRoles([ROLES.HOSTEL_GATE]), requireAppointmentRouteAccess, getGateAppointments);
router.patch(
  "/gate/:appointmentId/entry",
  authorizeRoles([ROLES.HOSTEL_GATE]),
  requireAppointmentRouteAccess,
  markGateAppointmentEntry
);

export default router;
