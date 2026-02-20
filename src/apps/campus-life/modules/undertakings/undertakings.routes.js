/**
 * Undertaking Routes
 * Handles undertaking documents and student assignments
 * 
 * Base path: /api/v1/undertaking
 */

import express from 'express';
import {
  createUndertaking,
  getAllUndertakings,
  updateUndertaking,
  deleteUndertaking,
  getAssignedStudents,
  addStudentsToUndertaking,
  removeStudentFromUndertaking,
  getUndertakingStatus,
  getStudentPendingUndertakings,
  getUndertakingDetails,
  acceptUndertaking,
  getStudentAcceptedUndertakings,
  getStudentPendingUndertakingsCount,
} from './undertakings.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const ADMIN_STAFF_UNDERTAKING_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.others',
  Warden: 'route.warden.undertakings',
  'Associate Warden': 'route.associateWarden.undertakings',
  'Hostel Supervisor': 'route.hostelSupervisor.undertakings',
};

const requireAdminUndertakingRouteAccess = (req, res, next) => {
  const routeKey = ADMIN_STAFF_UNDERTAKING_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// ============================================
// Admin/Staff routes
// ============================================
router.get(
  '/admin/undertakings',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.view']),
  getAllUndertakings
);
router.post(
  '/admin/undertakings',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.manage']),
  createUndertaking
);
router.put(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.manage']),
  updateUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.manage']),
  deleteUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/students',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.view']),
  getAssignedStudents
);
router.post(
  '/admin/undertakings/:undertakingId/students/by-roll-numbers',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.manage']),
  addStudentsToUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId/students/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.manage']),
  removeStudentFromUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/status',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAdminUndertakingRouteAccess,
  requireAnyCapability(['cap.undertakings.view']),
  getUndertakingStatus
);

// ============================================
// Student routes
// ============================================
router.get('/student/undertakings/pending', authorizeRoles(['Student']), requireRouteAccess('route.student.undertakings'), requireAnyCapability(['cap.undertakings.view']), getStudentPendingUndertakings);
router.get(
  '/student/undertakings/accepted',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  requireAnyCapability(['cap.undertakings.view']),
  getStudentAcceptedUndertakings
);
router.get('/student/undertakings/:undertakingId', authorizeRoles(['Student']), requireRouteAccess('route.student.undertakings'), requireAnyCapability(['cap.undertakings.view']), getUndertakingDetails);
router.post(
  '/student/undertakings/:undertakingId/accept',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  requireAnyCapability(['cap.undertakings.accept']),
  acceptUndertaking
);
router.get(
  '/student/undertakings/pending/count',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  requireAnyCapability(['cap.undertakings.view']),
  getStudentPendingUndertakingsCount
);

export default router;
