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
  getStudentProfile,
  updateStudentProfile,
  updateStudentsProfiles,
  getMultipleStudentDetails,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  getStudentId,
} from '../controllers/studentController.js';
import {
  getDepartmentsList,
  getDegreesList,
  renameDepartment,
  renameDegree,
} from '../controllers/adminController.js';
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

// Department & degree routes
router.get(
  '/departments/list',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getDepartmentsList
);
router.put('/departments/rename', authorizeRoles(['Admin']), renameDepartment);
router.get(
  '/degrees/list',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getDegreesList
);
router.put('/degrees/rename', authorizeRoles(['Admin']), renameDegree);

export default router;
