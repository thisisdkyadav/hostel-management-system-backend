/**
 * Event Routes
 * Handles event management
 * 
 * Base path: /api/v1/event
 */

import express from 'express';
import {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
} from './events.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const EVENTS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.events',
  [ROLES.WARDEN]: 'route.warden.events',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.events',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.events',
  [ROLES.STUDENT]: 'route.student.events',
};

const requireEventsRouteAccess = (req, res, next) => {
  const routeKey = EVENTS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Get events - accessible by multiple roles
router.get(
  '/',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requireEventsRouteAccess,
  requireAnyCapability(['cap.events.view']),
  getEvents
);

// Admin-only event management
router.post(
  '/',
  authorizeRoles(['Admin']),
  requireEventsRouteAccess,
  requireAnyCapability(['cap.events.create']),
  createEvent
);
router.put(
  '/:id',
  authorizeRoles(['Admin']),
  requireEventsRouteAccess,
  requireAnyCapability(['cap.events.create']),
  updateEvent
);
router.delete(
  '/:id',
  authorizeRoles(['Admin']),
  requireEventsRouteAccess,
  requireAnyCapability(['cap.events.create']),
  deleteEvent
);

export default router;
