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

const router = express.Router();

router.use(authenticate);

router.get(
  '/search',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  searchUsers
);

router.get(
  '/by-role',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUsersByRole
);

router.post('/bulk-password-update', authorizeRoles(['Super Admin', 'Admin']), bulkPasswordUpdate);
router.post('/bulk-remove-passwords', authorizeRoles(['Super Admin', 'Admin']), bulkRemovePasswords);
router.post('/remove-passwords-by-role', authorizeRoles(['Super Admin', 'Admin']), removePasswordsByRole);

router.post('/:id/remove-password', authorizeRoles(['Super Admin', 'Admin']), removeUserPassword);
router.get(
  '/:id',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUserById
);

export default router;

