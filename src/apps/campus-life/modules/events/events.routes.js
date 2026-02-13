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
import { requirePermission } from '../../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get events - accessible by multiple roles
router.get(
  '/',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requirePermission('events', 'view'),
  getEvents
);

// Admin-only event management
router.post('/', authorizeRoles(['Admin']), createEvent);
router.put('/:id', authorizeRoles(['Admin']), updateEvent);
router.delete('/:id', authorizeRoles(['Admin']), deleteEvent);

export default router;
