/**
 * Profiles Admin Routes
 * Admin/staff student profile and directory operations.
 *
 * Base path: /api/v1/students/profiles-admin
 */

import express from 'express';
import {
  createStudentsProfiles,
  updateStudentsProfiles,
  updateRoomAllocations,
  getStudents,
  getStudentDetails,
  getMultipleStudentDetails,
  getStudentId,
  updateStudentProfile,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
} from './profiles-admin.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../../utils/permissions.js';

const router = express.Router();

router.use(authenticate);

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
router.get(
  '/id/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentId
);
router.post('/profiles/status', authorizeRoles(['Admin']), bulkUpdateStudentsStatus);
router.put('/profiles/day-scholar', authorizeRoles(['Admin']), bulkUpdateDayScholarDetails);
router.put('/hostels/:hostelId/room-allocations', authorizeRoles(['Admin']), updateRoomAllocations);

export default router;
