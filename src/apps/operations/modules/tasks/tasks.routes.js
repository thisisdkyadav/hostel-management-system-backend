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

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin-only routes
router.post('/', authorizeRoles(['Admin', 'Super Admin']), createTask);
router.get('/all', authorizeRoles(['Admin', 'Super Admin']), getAllTasks);
router.put('/:id', authorizeRoles(['Admin', 'Super Admin']), updateTask);
router.delete('/:id', authorizeRoles(['Admin', 'Super Admin']), deleteTask);

// Routes for assigned users
router.get('/my-tasks', getUserTasks); // Any authenticated user can access their tasks
router.put('/:id/status', updateTaskStatus); // Status updates (permissions checked in controller)

export default router;
