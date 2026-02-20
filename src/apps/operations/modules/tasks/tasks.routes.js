/**
 * Tasks Routes
 * Handles task management for staff
 * 
 * Base path: /api/v1/tasks
 */

import express from 'express';
import {
  createTask,
  getAllTasks,
  getUserTasks,
  updateTaskStatus,
  updateTask,
  deleteTask,
} from './tasks.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const TASK_MANAGEMENT_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.taskManagement',
  'Super Admin': 'route.superAdmin.dashboard',
};

const TASK_MY_ROUTE_KEY_BY_ROLE = {
  Warden: 'route.warden.myTasks',
  'Associate Warden': 'route.associateWarden.myTasks',
  'Hostel Supervisor': 'route.hostelSupervisor.myTasks',
  Security: 'route.security.myTasks',
  'Hostel Gate': 'route.hostelGate.myTasks',
  'Maintenance Staff': 'route.maintenance.myTasks',
  Admin: 'route.admin.taskManagement',
  'Super Admin': 'route.superAdmin.dashboard',
};

const requireTaskManagementRouteAccess = (req, res, next) => {
  const routeKey = TASK_MANAGEMENT_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

const requireTaskMyRouteAccessIfMapped = (req, res, next) => {
  const routeKey = TASK_MY_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) return next();
  return requireRouteAccess(routeKey)(req, res, next);
};

// Admin-only routes
router.post('/', authorizeRoles(['Admin', 'Super Admin']), requireTaskManagementRouteAccess, requireAnyCapability(['cap.tasks.manage']), createTask);
router.get('/all', authorizeRoles(['Admin', 'Super Admin']), requireTaskManagementRouteAccess, requireAnyCapability(['cap.tasks.view']), getAllTasks);
router.put('/:id', authorizeRoles(['Admin', 'Super Admin']), requireTaskManagementRouteAccess, requireAnyCapability(['cap.tasks.manage']), updateTask);
router.delete('/:id', authorizeRoles(['Admin', 'Super Admin']), requireTaskManagementRouteAccess, requireAnyCapability(['cap.tasks.manage']), deleteTask);

// Routes for assigned users
router.get('/my-tasks', requireTaskMyRouteAccessIfMapped, requireAnyCapability(['cap.tasks.view']), getUserTasks);
router.put('/:id/status', requireTaskMyRouteAccessIfMapped, requireAnyCapability(['cap.tasks.status.update']), updateTaskStatus);

export default router;
