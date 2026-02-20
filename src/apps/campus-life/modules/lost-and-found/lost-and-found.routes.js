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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const LOST_AND_FOUND_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.lostAndFound',
  [ROLES.WARDEN]: 'route.warden.lostAndFound',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.lostAndFound',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.lostAndFound',
  [ROLES.SECURITY]: 'route.security.lostAndFound',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.lostAndFound',
  [ROLES.STUDENT]: 'route.student.lostAndFound',
};

const requireLostAndFoundRouteAccess = (req, res, next) => {
  const routeKey = LOST_AND_FOUND_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Get lost and found items
router.get(
  '/',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  requireLostAndFoundRouteAccess,
  requireAnyCapability(['cap.lostAndFound.view']),
  getLostAndFound
);

// Staff operations (excluding students)
router.post(
  '/',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  requireLostAndFoundRouteAccess,
  requireAnyCapability(['cap.lostAndFound.create']),
  createLostAndFound
);
router.put(
  '/:id',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  requireLostAndFoundRouteAccess,
  requireAnyCapability(['cap.lostAndFound.edit']),
  updateLostAndFound
);
router.delete(
  '/:id',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  requireLostAndFoundRouteAccess,
  requireAnyCapability(['cap.lostAndFound.delete']),
  deleteLostAndFound
);

export default router;
