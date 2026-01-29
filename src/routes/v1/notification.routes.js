/**
 * Notification Routes
 * Handles notification management
 * 
 * Base path: /api/notification
 */

import express from 'express';
import {
  createNotification,
  getNotificationStats,
  getNotifications,
  getActiveNotificationsCount,
} from '../../../controllers/notificationController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin-only: create notification
router.post('/', authorizeRoles(['Admin']), createNotification);

// Accessible by multiple roles
router.use(authorizeRoles(['Admin', 'Student', 'Warden', 'Associate Warden', 'Hostel Supervisor']));
router.get('/', getNotifications);
router.get('/stats', getNotificationStats);
router.get('/active-count', getActiveNotificationsCount);

export default router;
