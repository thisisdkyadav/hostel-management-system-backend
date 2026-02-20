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
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

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
  getAllUndertakings
);
router.post(
  '/admin/undertakings',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  createUndertaking
);
router.put(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  updateUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  deleteUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/students',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAdminUndertakingRouteAccess,
  getAssignedStudents
);
router.post(
  '/admin/undertakings/:undertakingId/students/by-roll-numbers',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  addStudentsToUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId/students/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden']),
  requireAdminUndertakingRouteAccess,
  removeStudentFromUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/status',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAdminUndertakingRouteAccess,
  getUndertakingStatus
);

// ============================================
// Student routes
// ============================================
router.get('/student/undertakings/pending', authorizeRoles(['Student']), requireRouteAccess('route.student.undertakings'), getStudentPendingUndertakings);
router.get(
  '/student/undertakings/accepted',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  getStudentAcceptedUndertakings
);
router.get('/student/undertakings/:undertakingId', authorizeRoles(['Student']), requireRouteAccess('route.student.undertakings'), getUndertakingDetails);
router.post(
  '/student/undertakings/:undertakingId/accept',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  acceptUndertaking
);
router.get(
  '/student/undertakings/pending/count',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.undertakings'),
  getStudentPendingUndertakingsCount
);

export default router;
