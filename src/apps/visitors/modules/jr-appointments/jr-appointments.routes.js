/**
 * JR Appointments Routes
 * Base path: /api/v1/jr-appointments
 */

import express from "express";
import {
  submitPublicJRAppointment,
  getAdminJRAppointments,
  getAdminJRAppointmentById,
  reviewJRAppointment,
  getGateJRAppointments,
  markGateJRAppointmentEntry,
} from "./jr-appointments.controller.js";
import { authenticate } from "../../../../middlewares/auth.middleware.js";
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js";
import { ROLES } from "../../../../core/constants/index.js";

const router = express.Router();

// Public endpoint: no login required
router.post("/", submitPublicJRAppointment);

// Protected endpoints
router.use(authenticate);

// Joint Registrar SA review endpoints (role + sub-role check in service)
router.get("/admin", authorizeRoles([ROLES.ADMIN]), getAdminJRAppointments);
router.get("/admin/:appointmentId", authorizeRoles([ROLES.ADMIN]), getAdminJRAppointmentById);
router.patch("/admin/:appointmentId/review", authorizeRoles([ROLES.ADMIN]), reviewJRAppointment);

// Hostel Gate operations
router.get("/gate", authorizeRoles([ROLES.HOSTEL_GATE]), getGateJRAppointments);
router.patch(
  "/gate/:appointmentId/entry",
  authorizeRoles([ROLES.HOSTEL_GATE]),
  markGateJRAppointmentEntry
);

export default router;
