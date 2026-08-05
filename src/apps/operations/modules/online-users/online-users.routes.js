/**
 * Online Users Routes
 * Handles online user tracking and statistics
 * 
 * Base path: /api/v1/online-users
 */

import express from 'express';
import {
  getOnlineUsers,
  getOnlineStats,
  getOnlineUserByUserId,
} from './online-users.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  Admin: 'route.admin.dashboard',
  'Super Admin': 'route.superAdmin.dashboard',
});

// Get currently online users (Admin and Super Admin only)
router.get('/', guard(['Admin', 'Super Admin']), getOnlineUsers);

// Get online users statistics (Admin and Super Admin only)
router.get('/stats', guard(['Admin', 'Super Admin']), getOnlineStats);

// Get online status of specific user (any authenticated user)
router.get('/:userId', getOnlineUserByUserId);

export default router;
