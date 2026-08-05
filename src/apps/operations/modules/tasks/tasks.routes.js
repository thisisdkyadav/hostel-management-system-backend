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
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guardManagement = routeGuard({
  Admin: 'route.admin.taskManagement',
  'Super Admin': 'route.superAdmin.dashboard',
});

const guardMy = routeGuard(
  {
    Warden: 'route.warden.myTasks',
    'Associate Warden': 'route.associateWarden.myTasks',
    'Hostel Supervisor': 'route.hostelSupervisor.myTasks',
    Security: 'route.security.myTasks',
    'Hostel Gate': 'route.hostelGate.myTasks',
    'Maintenance Staff': 'route.maintenance.myTasks',
    Admin: 'route.admin.taskManagement',
    'Super Admin': 'route.superAdmin.dashboard',
  },
  { onUnmapped: 'allow' }
);

// Admin-only routes
router.post('/', guardManagement(['Admin', 'Super Admin']), createTask);
router.get('/all', guardManagement(['Admin', 'Super Admin']), getAllTasks);
router.put('/:id', guardManagement(['Admin', 'Super Admin']), updateTask);
router.delete('/:id', guardManagement(['Admin', 'Super Admin']), deleteTask);

// Routes for assigned users
router.get('/my-tasks', guardMy.access, getUserTasks);
router.put('/:id/status', guardMy.access, updateTaskStatus);

export default router;
