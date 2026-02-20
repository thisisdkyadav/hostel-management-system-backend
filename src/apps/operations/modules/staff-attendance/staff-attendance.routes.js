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
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const ATTENDANCE_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.dashboard',
  [ROLES.WARDEN]: 'route.warden.dashboard',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.dashboard',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.dashboard',
  [ROLES.SECURITY]: 'route.security.attendance',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.attendance',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.attendance',
};

const requireAttendanceRouteAccess = (req, res, next) => {
  const routeKey = ATTENDANCE_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

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
    'Maintenance Staff',
  ]),
  requireAttendanceRouteAccess,
  requireAnyCapability(['cap.attendance.view']),
  getAttendanceRecords
);

export default router;
