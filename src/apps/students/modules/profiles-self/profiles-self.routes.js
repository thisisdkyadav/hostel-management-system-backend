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
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const ID_CARD_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
  [ROLES.STUDENT]: 'route.student.idCard',
};

const requireIdCardRouteAccess = (req, res, next) => {
  const routeKey = ID_CARD_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

router.use(authenticate);

router.get('/dashboard', authorizeRoles(['Student']), getStudentDashboard);
router.get('/profile', authorizeRoles(['Student']), getStudentProfile);
router.get(
  '/:userId/id-card',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requireIdCardRouteAccess,
  requireAnyCapability(['cap.students.idCard.view', 'cap.students.detail.view', 'cap.students.view']),
  getStudentIdCard
);
router.post(
  '/:userId/id-card',
  authorizeRoles(['Student']),
  requireIdCardRouteAccess,
  requireAnyCapability(['cap.students.idCard.upload']),
  uploadStudentIdCard
);

export default router;
