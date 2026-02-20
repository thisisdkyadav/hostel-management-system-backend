/**
 * User Routes
 * Handles user search, retrieval, and password management.
 *
 * Base path: /api/v1/users
 */

import express from 'express';
import {
  searchUsers,
  getUserById,
  getUsersByRole,
  bulkPasswordUpdate,
  removeUserPassword,
  removePasswordsByRole,
  bulkRemovePasswords,
} from './users.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

router.use(authenticate);
const USERS_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.students',
  'Super Admin': 'route.superAdmin.admins',
  Warden: 'route.warden.students',
  'Associate Warden': 'route.associateWarden.students',
  'Hostel Supervisor': 'route.hostelSupervisor.students',
};

const requireUsersRouteAccess = (req, res, next) => {
  const routeKey = USERS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

router.get(
  '/search',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireUsersRouteAccess,
  requireAnyCapability(['cap.users.view']),
  searchUsers
);

router.get(
  '/by-role',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireUsersRouteAccess,
  requireAnyCapability(['cap.users.view']),
  getUsersByRole
);

router.post('/bulk-password-update', authorizeRoles(['Super Admin', 'Admin']), requireUsersRouteAccess, requireAnyCapability(['cap.users.edit']), bulkPasswordUpdate);
router.post('/bulk-remove-passwords', authorizeRoles(['Super Admin', 'Admin']), requireUsersRouteAccess, requireAnyCapability(['cap.users.edit']), bulkRemovePasswords);
router.post('/remove-passwords-by-role', authorizeRoles(['Super Admin', 'Admin']), requireUsersRouteAccess, requireAnyCapability(['cap.users.edit']), removePasswordsByRole);

router.post('/:id/remove-password', authorizeRoles(['Super Admin', 'Admin']), requireUsersRouteAccess, requireAnyCapability(['cap.users.edit']), removeUserPassword);
router.get(
  '/:id',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireUsersRouteAccess,
  requireAnyCapability(['cap.users.view']),
  getUserById
);

export default router;
