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
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.dashboard',
  [ROLES.WARDEN]: 'route.warden.dashboard',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.dashboard',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.dashboard',
  [ROLES.SECURITY]: 'route.security.attendance',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.attendance',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.attendance',
});

// All routes require authentication
router.use(authenticate);

// QR verification and attendance recording (Hostel Gate only)
router.post('/verify-qr', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.attendance'), verifyQR);
router.post('/attendance/record', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.attendance'), recordAttendance);

// Get attendance records
router.get(
  '/attendance/records',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Maintenance Staff',
  ]),
  getAttendanceRecords
);

export default router;
