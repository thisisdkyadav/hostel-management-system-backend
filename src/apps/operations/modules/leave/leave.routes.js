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
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.leaves',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.leaves',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.leaves',
});

// Staff leave routes (Admin, Hostel Supervisor, Maintenance Staff)
router.use(authorizeRoles(['Admin', 'Hostel Supervisor', 'Maintenance Staff']));
router.get('/my-leaves', guard.access, getMyLeaves);
router.post('/', guard.access, createLeave);

// Admin-only leave management
router.use(authorizeRoles(['Admin']));
router.get('/all', requireRouteAccess('route.admin.leaves'), getLeaves);
router.put('/:id/approve', requireRouteAccess('route.admin.leaves'), approveLeave);
router.put('/:id/reject', requireRouteAccess('route.admin.leaves'), rejectLeave);
router.put('/:id/join', requireRouteAccess('route.admin.leaves'), joinLeave);

export default router;
