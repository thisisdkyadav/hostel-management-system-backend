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
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const LEAVE_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.leaves',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.leaves',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.leaves',
};

const requireLeaveRouteAccess = (req, res, next) => {
  const routeKey = LEAVE_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Staff leave routes (Admin, Hostel Supervisor, Maintenance Staff)
router.use(authorizeRoles(['Admin', 'Hostel Supervisor', 'Maintenance Staff']));
router.get('/my-leaves', requireLeaveRouteAccess, requireAnyCapability(['cap.leaves.view']), getMyLeaves);
router.post('/', requireLeaveRouteAccess, requireAnyCapability(['cap.leaves.create']), createLeave);

// Admin-only leave management
router.use(authorizeRoles(['Admin']));
router.get('/all', requireRouteAccess('route.admin.leaves'), requireAnyCapability(['cap.leaves.view']), getLeaves);
router.put('/:id/approve', requireRouteAccess('route.admin.leaves'), requireAnyCapability(['cap.leaves.review']), approveLeave);
router.put('/:id/reject', requireRouteAccess('route.admin.leaves'), requireAnyCapability(['cap.leaves.review']), rejectLeave);
router.put('/:id/join', requireRouteAccess('route.admin.leaves'), requireAnyCapability(['cap.leaves.review']), joinLeave);

export default router;
