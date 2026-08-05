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
import { ROLES } from "../../../../core/constants/index.js";
import { routeGuard } from "../../../../lib/api-kit/index.js";

const router = express.Router();

// Public endpoint: no login required
router.post("/", submitPublicAppointment);
router.get("/public/targets", getPublicAppointmentTargets);

// Protected endpoints
router.use(authenticate);

const guard = routeGuard({
  [ROLES.ADMIN]: "route.admin.appointments",
  [ROLES.HOSTEL_GATE]: "route.hostelGate.appointments",
});

// Admin review endpoints (role + sub-role check in service)
router.get("/admin", guard([ROLES.ADMIN]), getAdminAppointments);
router.get("/admin/me/availability", guard([ROLES.ADMIN]), getMyAppointmentAvailability);
router.patch("/admin/me/availability", guard([ROLES.ADMIN]), updateMyAppointmentAvailability);
router.get("/admin/:appointmentId", guard([ROLES.ADMIN]), getAdminAppointmentById);
router.patch("/admin/:appointmentId/review", guard([ROLES.ADMIN]), reviewAppointment);

// Hostel Gate operations
router.get("/gate", guard([ROLES.HOSTEL_GATE]), getGateAppointments);
router.patch(
  "/gate/:appointmentId/entry",
  guard([ROLES.HOSTEL_GATE]),
  markGateAppointmentEntry
);

export default router;
