/**
 * Profiles Self Routes
 * Student-facing dashboard/profile and ID card routes.
 *
 * Base path: /api/v1/students/profiles-self
 */

import express from 'express';
import {
  getStudentProfile,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
} from './profiles-self.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
  [ROLES.STUDENT]: 'route.student.idCard',
});

router.use(authenticate);

router.get(
  '/dashboard',
  authorizeRoles(['Student']),
  requireRouteAccess('route.student.dashboard'),
  getStudentDashboard
);
router.get('/profile', authorizeRoles(['Student']), getStudentProfile);
router.get(
  '/:userId/id-card',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getStudentIdCard
);
router.post(
  '/:userId/id-card',
  guard(['Student']),
  uploadStudentIdCard
);

export default router;
