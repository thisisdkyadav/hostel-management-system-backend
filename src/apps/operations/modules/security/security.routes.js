/**
 * Security Routes
 * Handles security operations, student entries, and QR verification
 * 
 * Base path: /api/v1/security
 */

import express from 'express';
import {
  getSecurity,
  verifyQR,
  addStudentEntryWithEmail,
  addVisitor,
  getVisitors,
  updateVisitor,
  addStudentEntry,
  getRecentEntries,
  updateStudentEntry,
  getStudentEntries,
  deleteStudentEntry,
  deleteVisitor,
  updateStudentEntryCrossHostelReason,
  getFaceScannerEntries,
} from './security.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const SECURITY_ENTRIES_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.security',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
  [ROLES.SECURITY]: 'route.security.attendance',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.entries',
  [ROLES.STUDENT]: 'route.student.security',
};

const requireSecurityEntriesRouteAccess = (req, res, next) => {
  const routeKey = SECURITY_ENTRIES_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Security profile
router.get('/', getSecurity);

// Student entries
router.get(
  '/entries',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  requireSecurityEntriesRouteAccess,
  getStudentEntries
);
router.get('/entries/recent', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.dashboard'), getRecentEntries);
router.get('/entries/face-scanner', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.faceScannerEntries'), getFaceScannerEntries);
router.post('/entries', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.entries'), addStudentEntry);
router.post('/entries/email', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.entries'), addStudentEntryWithEmail);
router.put('/entries/:entryId', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.entries'), updateStudentEntry);
router.patch(
  '/entries/:entryId/cross-hostel-reason',
  authorizeRoles(['Hostel Gate']),
  requireRouteAccess('route.hostelGate.entries'),
  updateStudentEntryCrossHostelReason
);
router.delete('/entries/:entryId', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.entries'), deleteStudentEntry);

// QR verification
router.post('/verify-qr', authorizeRoles(['Hostel Gate']), requireRouteAccess('route.hostelGate.scannerEntries'), verifyQR);

export default router;
