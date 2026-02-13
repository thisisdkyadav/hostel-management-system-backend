/**
 * Leave Routes
 * Handles staff leave requests and approvals
 * 
 * Base path: /api/v1/leave
 */

import express from 'express';
import {
  createLeave,
  getMyLeaves,
  getLeaves,
  approveLeave,
  rejectLeave,
  joinLeave,
} from './leave.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Staff leave routes (Admin, Hostel Supervisor, Maintenance Staff)
router.use(authorizeRoles(['Admin', 'Hostel Supervisor', 'Maintenance Staff']));
router.get('/my-leaves', getMyLeaves);
router.post('/', createLeave);

// Admin-only leave management
router.use(authorizeRoles(['Admin']));
router.get('/all', getLeaves);
router.put('/:id/approve', approveLeave);
router.put('/:id/reject', rejectLeave);
router.put('/:id/join', joinLeave);

export default router;
