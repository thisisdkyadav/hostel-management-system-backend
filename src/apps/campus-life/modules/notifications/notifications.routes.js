/**
 * Notification Routes
 * Handles notification management
 * 
 * Base path: /api/v1/notification
 */

import express from 'express';
import {
  createNotification,
  getNotificationStats,
  getNotifications,
  getActiveNotificationsCount,
} from './notifications.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  Admin: 'route.admin.notifications',
  Student: 'route.student.notifications',
  Warden: 'route.warden.notifications',
  'Associate Warden': 'route.associateWarden.notifications',
  'Hostel Supervisor': 'route.hostelSupervisor.notifications',
});

// Admin-only: create notification
router.post(
  '/',
  authorizeRoles(['Admin']),
  requireRouteAccess('route.admin.notifications'),
  createNotification
);

// Accessible by multiple roles
router.use(authorizeRoles(['Admin', 'Student', 'Warden', 'Associate Warden', 'Hostel Supervisor']));
router.get('/', guard.access, getNotifications);
router.get('/stats', guard.access, getNotificationStats);
router.get('/active-count', guard.access, getActiveNotificationsCount);

export default router;
