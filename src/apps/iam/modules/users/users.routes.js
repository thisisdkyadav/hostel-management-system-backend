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
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

router.use(authenticate);
const guard = routeGuard({
  Admin: 'route.admin.students',
  'Super Admin': 'route.superAdmin.admins',
  Warden: 'route.warden.students',
  'Associate Warden': 'route.associateWarden.students',
  'Hostel Supervisor': 'route.hostelSupervisor.students',
});

router.get(
  '/search',
  guard(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  searchUsers
);

router.get(
  '/by-role',
  guard(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUsersByRole
);

router.post('/bulk-password-update', guard(['Super Admin', 'Admin']), bulkPasswordUpdate);
router.post('/bulk-remove-passwords', guard(['Super Admin', 'Admin']), bulkRemovePasswords);
router.post('/remove-passwords-by-role', guard(['Super Admin', 'Admin']), removePasswordsByRole);

router.post('/:id/remove-password', guard(['Super Admin', 'Admin']), removeUserPassword);
router.get(
  '/:id',
  guard(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUserById
);

export default router;
