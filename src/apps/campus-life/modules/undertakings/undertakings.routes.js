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
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  Admin: 'route.admin.others',
  Warden: 'route.warden.undertakings',
  'Associate Warden': 'route.associateWarden.undertakings',
  'Hostel Supervisor': 'route.hostelSupervisor.undertakings',
});

// ============================================
// Admin/Staff routes
// ============================================
router.get(
  '/admin/undertakings',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getAllUndertakings
);
router.post(
  '/admin/undertakings',
  guard(['Admin', 'Warden', 'Associate Warden']),
  createUndertaking
);
router.put(
  '/admin/undertakings/:undertakingId',
  guard(['Admin', 'Warden', 'Associate Warden']),
  updateUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId',
  guard(['Admin', 'Warden', 'Associate Warden']),
  deleteUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/students',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getAssignedStudents
);
router.post(
  '/admin/undertakings/:undertakingId/students/by-roll-numbers',
  guard(['Admin', 'Warden', 'Associate Warden']),
  addStudentsToUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId/students/:studentId',
  guard(['Admin', 'Warden', 'Associate Warden']),
  removeStudentFromUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/status',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
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
