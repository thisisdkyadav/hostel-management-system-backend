/**
 * Permission Routes
 * Handles user and role permission management.
 *
 * Base path: /api/v1/permissions
 */

import express from 'express';
import {
  getUserPermissions,
  updateUserPermissions,
  resetUserPermissions,
  getUsersByRole,
  resetRolePermissions,
  setRolePermissions,
} from './permissions.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(['Admin']));

router.get('/users/:role?', getUsersByRole);

router.get('/user/:userId', getUserPermissions);
router.put('/user/:userId', updateUserPermissions);
router.post('/user/:userId/reset', resetUserPermissions);

router.post('/role/:role/reset', resetRolePermissions);
router.put('/role/:role', setRolePermissions);

export default router;

