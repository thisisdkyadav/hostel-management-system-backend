/**
 * Staff Attendance Routes
 * Handles staff attendance tracking via QR codes
 * 
 * Base path: /api/staff
 */

import express from 'express';
import {
  verifyQR,
  recordAttendance,
  getAttendanceRecords,
} from './staff-attendance.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// QR verification and attendance recording (Hostel Gate only)
router.post('/verify-qr', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.attendance'), requireAnyCapability(['cap.attendance.record']), verifyQR);
router.post('/attendance/record', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.attendance'), requireAnyCapability(['cap.attendance.record']), recordAttendance);

// Get attendance records
router.get(
  '/attendance/records',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  requireAnyCapability(['cap.attendance.view']),
  getAttendanceRecords
);

export default router;
