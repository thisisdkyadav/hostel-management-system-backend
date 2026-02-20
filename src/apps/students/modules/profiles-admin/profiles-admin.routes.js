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
  getDepartmentsList,
  renameDepartment,
  getDegreesList,
  renameDegree,
} from './profiles-admin.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

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
  '/hostels/:hostelId/room-allocations',
  authorizeRoles(['Admin']),
  requireStudentsRouteAccess,
  updateRoomAllocations
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
router.put(
  '/degrees/rename',
  authorizeRoles(['Admin']),
  requireAdminSettingsRouteAccess,
  renameDegree
);

export default router;
