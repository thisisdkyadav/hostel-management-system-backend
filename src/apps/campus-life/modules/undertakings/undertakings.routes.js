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

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// ============================================
// Admin/Staff routes
// ============================================
router.get(
  '/admin/undertakings',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden', 'Hostel Supervisor']),
  getAllUndertakings
);
router.post(
  '/admin/undertakings',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden']),
  createUndertaking
);
router.put(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden']),
  updateUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden']),
  deleteUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/students',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden', 'Hostel Supervisor']),
  getAssignedStudents
);
router.post(
  '/admin/undertakings/:undertakingId/students/by-roll-numbers',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden']),
  addStudentsToUndertaking
);
router.delete(
  '/admin/undertakings/:undertakingId/students/:studentId',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden']),
  removeStudentFromUndertaking
);
router.get(
  '/admin/undertakings/:undertakingId/status',
  authorizeRoles(['Admin', 'Warden', 'AssociateWarden', 'Hostel Supervisor']),
  getUndertakingStatus
);

// ============================================
// Student routes
// ============================================
router.get('/student/undertakings/pending', authorizeRoles(['Student']), getStudentPendingUndertakings);
router.get(
  '/student/undertakings/accepted',
  authorizeRoles(['Student']),
  getStudentAcceptedUndertakings
);
router.get('/student/undertakings/:undertakingId', authorizeRoles(['Student']), getUndertakingDetails);
router.post(
  '/student/undertakings/:undertakingId/accept',
  authorizeRoles(['Student']),
  acceptUndertaking
);
router.get(
  '/student/undertakings/pending/count',
  authorizeRoles(['Student']),
  getStudentPendingUndertakingsCount
);

export default router;
