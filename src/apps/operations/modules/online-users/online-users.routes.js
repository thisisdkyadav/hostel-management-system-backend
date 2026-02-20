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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const ONLINE_USERS_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.dashboard',
  'Super Admin': 'route.superAdmin.dashboard',
};

const requireOnlineUsersRouteAccess = (req, res, next) => {
  const routeKey = ONLINE_USERS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Get currently online users (Admin and Super Admin only)
router.get('/', authorizeRoles(['Admin', 'Super Admin']), requireOnlineUsersRouteAccess, requireAnyCapability(['cap.onlineUsers.view']), getOnlineUsers);

// Get online users statistics (Admin and Super Admin only)
router.get('/stats', authorizeRoles(['Admin', 'Super Admin']), requireOnlineUsersRouteAccess, requireAnyCapability(['cap.onlineUsers.view']), getOnlineStats);

// Get online status of specific user (any authenticated user)
router.get('/:userId', getOnlineUserByUserId);

export default router;
