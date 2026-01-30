/**
 * Online Users Routes
 * Handles online user tracking and statistics
 * 
 * Base path: /api/online-users
 */

import express from 'express';
import {
  getOnlineUsers,
  getOnlineStats,
  getOnlineUserByUserId,
} from '../../controllers/onlineUsersController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get currently online users (Admin and Super Admin only)
router.get('/', authorizeRoles(['Admin', 'Super Admin']), getOnlineUsers);

// Get online users statistics (Admin and Super Admin only)
router.get('/stats', authorizeRoles(['Admin', 'Super Admin']), getOnlineStats);

// Get online status of specific user (any authenticated user)
router.get('/:userId', getOnlineUserByUserId);

export default router;
