/**
 * Student Routes
 * Handles student profiles, dashboard, and related operations
 * 
 * Base path: /api/student
 */

import express from 'express';
import {
  createStudentsProfiles,
  getStudents,
  getStudentDetails,
  updateStudentProfile,
  updateStudentsProfiles,
  getMultipleStudentDetails,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  getStudentId,
} from '../../students/modules/profiles-admin/profiles-admin.controller.js';
import {
  getStudentProfile,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
} from '../../students/modules/profiles-self/profiles-self.controller.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Student dashboard & profile
router.get('/dashboard', authorizeRoles(['Student']), getStudentDashboard);
router.get('/profile', authorizeRoles(['Student']), getStudentProfile);
router.get(
  '/id/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentId
);

// Student profiles management
router.get(
  '/profiles',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudents
);
router.post('/profiles', authorizeRoles(['Admin']), createStudentsProfiles);
router.put(
  '/profiles',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'edit'),
  updateStudentsProfiles
);
router.post(
  '/profiles/ids',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getMultipleStudentDetails
);
router.get(
  '/profile/details/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudentDetails
);
router.put(
  '/profile/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'edit'),
  updateStudentProfile
);
router.post('/profiles/status', authorizeRoles(['Admin']), bulkUpdateStudentsStatus);
router.put('/profiles/day-scholar', authorizeRoles(['Admin']), bulkUpdateDayScholarDetails);

// Student ID card routes
router.get(
  '/:userId/id-card',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requirePermission('students_info', 'view'),
  getStudentIdCard
);
router.post('/:userId/id-card', authorizeRoles(['Student']), uploadStudentIdCard);

export default router;
