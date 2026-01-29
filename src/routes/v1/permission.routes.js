/**
 * Permission Routes
 * Handles user and role permission management
 * 
 * Base path: /api/permissions
 */

import express from 'express';
import {
  getUserPermissions,
  updateUserPermissions,
  resetUserPermissions,
  getUsersByRole,
  resetRolePermissions,
  setRolePermissions,
} from '../../../controllers/permissionController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication and Admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Get users by role
router.get('/users/:role?', getUsersByRole);

// User-specific permission operations
router.get('/user/:userId', getUserPermissions);
router.put('/user/:userId', updateUserPermissions);
router.post('/user/:userId/reset', resetUserPermissions);

// Role-wide permission operations
router.post('/role/:role/reset', resetRolePermissions);
router.put('/role/:role', setRolePermissions);

export default router;
