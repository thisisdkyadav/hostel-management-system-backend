/**
 * Leave Routes
 * Handles staff leave requests and approvals
 * 
 * Base path: /api/leave
 */

import express from 'express';
import {
  createLeave,
  getMyLeaves,
  getLeaves,
  approveLeave,
  rejectLeave,
  joinLeave,
} from '../../../controllers/leaveController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';
import { validate } from '../../validations/validate.middleware.js';
import {
  createLeaveSchema,
  getLeavesSchema,
  approveLeaveSchema,
  rejectLeaveSchema,
  joinLeaveSchema,
} from '../../validations/leave.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Staff leave routes (Admin, Hostel Supervisor, Maintenance Staff)
router.use(authorizeRoles(['Admin', 'Hostel Supervisor', 'Maintenance Staff']));
router.get('/my-leaves', validate(getLeavesSchema), getMyLeaves);
router.post('/', validate(createLeaveSchema), createLeave);

// Admin-only leave management
router.use(authorizeRoles(['Admin']));
router.get('/all', validate(getLeavesSchema), getLeaves);
router.put('/:id/approve', validate(approveLeaveSchema), approveLeave);
router.put('/:id/reject', validate(rejectLeaveSchema), rejectLeave);
router.put('/:id/join', validate(joinLeaveSchema), joinLeave);

export default router;
