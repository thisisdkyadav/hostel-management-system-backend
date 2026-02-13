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
import { requirePermission } from '../../../../utils/permissions.js';

const router = express.Router();

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
  requirePermission('lost_and_found', 'view'),
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
  requirePermission('lost_and_found', 'create'),
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
  requirePermission('lost_and_found', 'edit'),
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
  requirePermission('lost_and_found', 'delete'),
  deleteLostAndFound
);

export default router;
