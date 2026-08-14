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
  getStudentExportDetails,
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
  getTaxonomyOptions,
} from './profiles-admin.taxonomy.module.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';
import { checkMissingRollNumbersSchema } from '../../../../validations/student.validation.js';

const router = express.Router();

router.use(authenticate);

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
});

const requireAdminSettingsRouteAccess = requireRouteAccess('route.admin.settings');

// Roles allowed to run the bulk student tools. Hostel Supervisors get the same
// toolset as Admins here; the write routes are additionally gated on
// `cap.students.edit.personal`, exactly like the single/bulk profile edits.
const BULK_TOOL_ROLES = ['Admin', 'Hostel Supervisor'];
const requireStudentEditCapability = requireAnyCapability(['cap.students.edit.personal']);

router.get(
  '/profiles',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudents
);
router.post(
  '/profiles',
  guard(['Admin']),
  createStudentsProfiles
);
router.put(
  '/profiles',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAnyCapability(['cap.students.edit.personal']),
  updateStudentsProfiles
);
router.post(
  '/profiles/ids',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getMultipleStudentDetails
);
router.post(
  '/profiles/export',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentExportDetails
);
router.get(
  '/profile/details/:userId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentDetails
);
router.put(
  '/profile/:userId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireAnyCapability(['cap.students.edit.personal']),
  updateStudentProfile
);
router.get(
  '/id/:userId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentId
);
router.post(
  '/profiles/check-roll-numbers',
  guard(BULK_TOOL_ROLES),
  validate(checkMissingRollNumbersSchema),
  checkMissingRollNumbers
);
router.post(
  '/profiles/status',
  guard(BULK_TOOL_ROLES),
  requireStudentEditCapability,
  bulkUpdateStudentsStatus
);
router.put(
  '/profiles/day-scholar',
  guard(BULK_TOOL_ROLES),
  requireStudentEditCapability,
  bulkUpdateDayScholarDetails
);
router.put(
  '/profiles/batch',
  guard(BULK_TOOL_ROLES),
  requireStudentEditCapability,
  bulkUpdateStudentsBatch
);
router.put(
  '/profiles/groups',
  guard(BULK_TOOL_ROLES),
  requireStudentEditCapability,
  bulkUpdateStudentsGroups
);
// Allocation writes: Admin + Hostel Supervisor. Supervisors are further limited
// in the handler to their active hostel and to students already in that hostel
// (or unallocated). Lookup is open to the same roles so the bulk UI can validate.
router.put(
  '/hostels/:hostelId/room-allocations',
  guard(['Admin', 'Hostel Supervisor']),
  updateRoomAllocations
);
router.get(
  '/room-allocations/student/:rollNumber',
  guard(['Admin', 'Hostel Supervisor']),
  getAllocationStudentByRollNumber
);
router.get(
  '/taxonomy/options',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getTaxonomyOptions
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
