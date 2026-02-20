/**
 * Family Member Routes
 * Handles student family member management
 * 
 * Base path: /api/v1/family
 */

import express from 'express';
import {
  createFamilyMember,
  getFamilyMembers,
  updateFamilyMember,
  deleteFamilyMember,
  updateBulkFamilyMembers,
} from './family.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const FAMILY_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
};

const requireFamilyRouteAccess = (req, res, next) => {
  const routeKey = FAMILY_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication and staff roles
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']));
router.use(requireFamilyRouteAccess);

// Bulk update family members
router.post('/bulk-update', requireAnyCapability(['cap.students.family.edit']), updateBulkFamilyMembers);

// Individual family member operations
router.post('/:userId', requireAnyCapability(['cap.students.family.edit']), createFamilyMember);
router.get('/:userId', requireAnyCapability(['cap.students.family.view', 'cap.students.detail.view', 'cap.students.view']), getFamilyMembers);
router.put('/:id', requireAnyCapability(['cap.students.family.edit']), updateFamilyMember);
router.delete('/:id', requireAnyCapability(['cap.students.family.edit']), deleteFamilyMember);

export default router;
