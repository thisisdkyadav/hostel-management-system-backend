/**
 * Lost and Found Routes
 * Handles lost and found item management
 * 
 * Base path: /api/v1/lost-and-found
 */

import express from 'express';
import {
  createLostAndFound,
  getLostAndFound,
  updateLostAndFound,
  deleteLostAndFound,
} from './lost-and-found.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.lostAndFound',
  [ROLES.WARDEN]: 'route.warden.lostAndFound',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.lostAndFound',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.lostAndFound',
  [ROLES.SECURITY]: 'route.security.lostAndFound',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.lostAndFound',
  [ROLES.STUDENT]: 'route.student.lostAndFound',
});

// All routes require authentication
router.use(authenticate);

// Get lost and found items
router.get(
  '/',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  getLostAndFound
);

// Staff operations (excluding students)
router.post(
  '/',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  createLostAndFound
);
router.put(
  '/:id',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  updateLostAndFound
);
router.delete(
  '/:id',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  deleteLostAndFound
);

export default router;
