/**
 * Warden Routes
 * Handles warden, associate warden, and hostel supervisor profiles
 * 
 * Base path: /api/v1/warden
 */

import express from 'express';
import {
  getWardenProfile,
  setActiveHostel,
} from './warden.controller.js';
import {
  getAssociateWardenProfile,
  setActiveHostelAW,
} from './associate-warden.controller.js';
import {
  getHostelSupervisorProfile,
  setActiveHostelHS,
} from './hostel-supervisor.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Warden profile routes
router.get('/profile', authorizeRoles(['Warden']), getWardenProfile);
router.put('/active-hostel', authorizeRoles(['Warden']), setActiveHostel);

// Associate Warden profile routes
router.get(
  '/associate-warden/profile',
  authorizeRoles(['Associate Warden']),
  getAssociateWardenProfile
);
router.put(
  '/associate-warden/active-hostel',
  authorizeRoles(['Associate Warden']),
  setActiveHostelAW
);

// Hostel Supervisor profile routes
router.get(
  '/hostel-supervisor/profile',
  authorizeRoles(['Hostel Supervisor']),
  getHostelSupervisorProfile
);
router.put(
  '/hostel-supervisor/active-hostel',
  authorizeRoles(['Hostel Supervisor']),
  setActiveHostelHS
);

export default router;
