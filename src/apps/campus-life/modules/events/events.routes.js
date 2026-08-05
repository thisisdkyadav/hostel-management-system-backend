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
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.events',
  [ROLES.WARDEN]: 'route.warden.events',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.events',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.events',
  [ROLES.STUDENT]: 'route.student.events',
});

// All routes require authentication
router.use(authenticate);

// Get events - accessible by multiple roles
router.get(
  '/',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getEvents
);

// Admin-only event management
router.post(
  '/',
  guard(['Admin']),
  createEvent
);
router.put(
  '/:id',
  guard(['Admin']),
  updateEvent
);
router.delete(
  '/:id',
  guard(['Admin']),
  deleteEvent
);

export default router;
