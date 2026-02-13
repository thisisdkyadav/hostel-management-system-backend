/**
 * @fileoverview Operations App Entry Point
 * @description Main router for operational hostel workflows
 * @module apps/operations
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /tasks/* -> task management
 */

import express from 'express';
import tasksRoutes from './modules/tasks/tasks.routes.js';

const router = express.Router();

router.use('/tasks', tasksRoutes);

export default router;
