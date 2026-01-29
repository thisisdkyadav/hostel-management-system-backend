/**
 * User Routes
 * Handles user search, retrieval, and password management
 * 
 * Base path: /api/users
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
} from '../../../controllers/userController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Search users by name or email
router.get(
  '/search',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  searchUsers
);

// Get users by role
router.get(
  '/by-role',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUsersByRole
);

// Bulk password operations (Super Admin and Admin only)
router.post(
  '/bulk-password-update',
  authorizeRoles(['Super Admin', 'Admin']),
  bulkPasswordUpdate
);
router.post(
  '/bulk-remove-passwords',
  authorizeRoles(['Super Admin', 'Admin']),
  bulkRemovePasswords
);
router.post(
  '/remove-passwords-by-role',
  authorizeRoles(['Super Admin', 'Admin']),
  removePasswordsByRole
);

// Individual user operations
router.post(
  '/:id/remove-password',
  authorizeRoles(['Super Admin', 'Admin']),
  removeUserPassword
);
router.get(
  '/:id',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUserById
);

export default router;
