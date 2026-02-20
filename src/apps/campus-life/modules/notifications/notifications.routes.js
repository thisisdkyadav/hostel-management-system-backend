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

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const NOTIFICATION_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.notifications',
  Student: 'route.student.notifications',
  Warden: 'route.warden.notifications',
  'Associate Warden': 'route.associateWarden.notifications',
  'Hostel Supervisor': 'route.hostelSupervisor.notifications',
};

const requireNotificationRouteAccess = (req, res, next) => {
  const routeKey = NOTIFICATION_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Admin-only: create notification
router.post(
  '/',
  authorizeRoles(['Admin']),
  requireRouteAccess('route.admin.notifications'),
  createNotification
);

// Accessible by multiple roles
router.use(authorizeRoles(['Admin', 'Student', 'Warden', 'Associate Warden', 'Hostel Supervisor']));
router.get('/', requireNotificationRouteAccess, getNotifications);
router.get('/stats', requireNotificationRouteAccess, getNotificationStats);
router.get('/active-count', requireNotificationRouteAccess, getActiveNotificationsCount);

export default router;
