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
import { ROLES } from "../../../../core/constants/index.js";

const router = express.Router();

// Public endpoint: no login required
router.post("/", submitPublicAppointment);
router.get("/public/targets", getPublicAppointmentTargets);

// Protected endpoints
router.use(authenticate);

// Admin review endpoints (role + sub-role check in service)
router.get("/admin", authorizeRoles([ROLES.ADMIN]), getAdminAppointments);
router.get("/admin/me/availability", authorizeRoles([ROLES.ADMIN]), getMyAppointmentAvailability);
router.patch("/admin/me/availability", authorizeRoles([ROLES.ADMIN]), updateMyAppointmentAvailability);
router.get("/admin/:appointmentId", authorizeRoles([ROLES.ADMIN]), getAdminAppointmentById);
router.patch("/admin/:appointmentId/review", authorizeRoles([ROLES.ADMIN]), reviewAppointment);

// Hostel Gate operations
router.get("/gate", authorizeRoles([ROLES.HOSTEL_GATE]), getGateAppointments);
router.patch(
  "/gate/:appointmentId/entry",
  authorizeRoles([ROLES.HOSTEL_GATE]),
  markGateAppointmentEntry
);

export default router;
