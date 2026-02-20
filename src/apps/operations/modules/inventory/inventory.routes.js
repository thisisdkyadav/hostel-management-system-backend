/**
 * Inventory Routes
 * Handles inventory item types, hostel inventory, and student inventory
 * 
 * Base path: /api/v1/inventory
 */

import express from 'express';
import {
  createInventoryItemType,
  getInventoryItemTypes,
  getInventoryItemTypeById,
  updateInventoryItemType,
  deleteInventoryItemType,
  updateInventoryItemTypeCount,
} from './inventory-item-type.controller.js';
import {
  assignInventoryToHostel,
  getHostelInventory,
  getAllHostelInventory,
  updateHostelInventory,
  deleteHostelInventory,
  getInventorySummaryByHostel,
} from './hostel-inventory.controller.js';
import {
  assignInventoryToStudent,
  getStudentInventory,
  getAllStudentInventory,
  returnStudentInventory,
  updateInventoryStatus,
  getInventorySummaryByStudent,
  getInventorySummaryByItemType,
} from './student-inventory.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const INVENTORY_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.inventory',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard',
  [ROLES.WARDEN]: 'route.warden.studentInventory',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.studentInventory',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.studentInventory',
};

const requireInventoryRouteAccess = (req, res, next) => {
  const routeKey = INVENTORY_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// ============================================
// Inventory Item Type Routes
// ============================================
router
  .route('/types')
  .post(authorizeRoles(['Admin', 'Super Admin']), createInventoryItemType)
  .get(authorizeRoles(['Admin', 'Super Admin']), getInventoryItemTypes);

router
  .route('/types/:id')
  .get(authorizeRoles(['Admin', 'Super Admin']), getInventoryItemTypeById)
  .put(authorizeRoles(['Admin', 'Super Admin']), updateInventoryItemType)
  .delete(authorizeRoles(['Admin', 'Super Admin']), deleteInventoryItemType);

router
  .route('/types/:id/count')
  .patch(authorizeRoles(['Admin', 'Super Admin']), updateInventoryItemTypeCount);

// ============================================
// Hostel Inventory Routes
// ============================================
router
  .route('/hostel')
  .post(authorizeRoles(['Admin', 'Super Admin']), assignInventoryToHostel)
  .get(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.view']),
    getAllHostelInventory
  );

router
  .route('/hostel/summary')
  .get(authorizeRoles(['Admin', 'Super Admin']), getInventorySummaryByHostel);

router
  .route('/hostel/item/:id')
  .put(authorizeRoles(['Admin', 'Super Admin']), updateHostelInventory)
  .delete(authorizeRoles(['Admin', 'Super Admin']), deleteHostelInventory);

// ============================================
// Student Inventory Routes
// ============================================
router
  .route('/student')
  .post(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.assign']),
    assignInventoryToStudent
  )
  .get(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.view']),
    getAllStudentInventory
  );

router
  .route('/student/summary/student')
  .get(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.view']),
    getInventorySummaryByStudent
  );

router
  .route('/student/summary/item')
  .get(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.view']),
    getInventorySummaryByItemType
  );

router
  .route('/student/:studentProfileId')
  .get(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.view']),
    getStudentInventory
  );

router
  .route('/student/:id/return')
  .put(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.edit']),
    returnStudentInventory
  );

router
  .route('/student/:id/status')
  .put(
    authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
    requireInventoryRouteAccess,
    requireAnyCapability(['cap.inventory.edit']),
    updateInventoryStatus
  );

export default router;
