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
  getStudents,
  getStudentDetails,
  getMultipleStudentDetails,
  getStudentId,
  updateStudentProfile,
} from './profiles-admin.profiles.module.js';
import {
  checkMissingRollNumbers,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  bulkUpdateStudentsBatch,
  bulkUpdateStudentsGroups,
} from './profiles-admin.bulk.module.js';
import {
  getAllocationStudentByRollNumber,
  updateRoomAllocations,
} from './profiles-admin.allocations.module.js';
import {
  getDepartmentsList,
  renameDepartment,
  getDegreesList,
  renameDegree,
  getBatchesList,
  renameBatch,
  renameGroup,
} from './profiles-admin.taxonomy.module.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';
import { checkMissingRollNumbersSchema } from '../../../../validations/student.validation.js';

const router = express.Router();

router.use(authenticate);

const STUDENTS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
};

const requireStudentsRouteAccess = (req, res, next) => {
  const routeKey = STUDENTS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

const requireAdminSettingsRouteAccess = requireRouteAccess('route.admin.settings');

router.get(
  '/profiles',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  getStudents
);
router.post(
  '/profiles',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  createStudentsProfiles
);
router.put(
  '/profiles',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  requireAnyCapability(['cap.students.edit.personal']),
  updateStudentsProfiles
);
router.post(
  '/profiles/ids',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  getMultipleStudentDetails
);
router.get(
  '/profile/details/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  getStudentDetails
);
router.put(
  '/profile/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  requireAnyCapability(['cap.students.edit.personal']),
  updateStudentProfile
);
router.get(
  '/id/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireStudentsRouteAccess,
  getStudentId
);
router.post(
  '/profiles/check-roll-numbers',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  validate(checkMissingRollNumbersSchema),
  checkMissingRollNumbers
);
router.post(
  '/profiles/status',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  bulkUpdateStudentsStatus
);
router.put(
  '/profiles/day-scholar',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  bulkUpdateDayScholarDetails
);
router.put(
  '/profiles/batch',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  bulkUpdateStudentsBatch
);
router.put(
  '/profiles/groups',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  bulkUpdateStudentsGroups
);
router.put(
  '/hostels/:hostelId/room-allocations',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  updateRoomAllocations
);
router.get(
  '/room-allocations/student/:rollNumber',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  getAllocationStudentByRollNumber
);
router.get(
  '/departments/list',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getDepartmentsList
);
router.put(
  '/departments/rename',
  authorizeRoles(['Admin']),
  requireAdminSettingsRouteAccess,
  renameDepartment
);
router.get(
  '/degrees/list',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getDegreesList
);
router.get(
  '/batches/list',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getBatchesList
);
router.put(
  '/degrees/rename',
  authorizeRoles(['Admin']),
  requireAdminSettingsRouteAccess,
  renameDegree
);
router.put(
  '/batches/rename',
  authorizeRoles(['Admin']),
  requireAdminSettingsRouteAccess,
  renameBatch
);
router.put(
  '/groups/rename',
  authorizeRoles(['Admin']),
  requireAdminSettingsRouteAccess,
  renameGroup
);

export default router;
