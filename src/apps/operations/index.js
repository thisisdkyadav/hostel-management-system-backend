/**
 * @fileoverview Operations App Entry Point
 * @description Main router for operational hostel workflows
 * @module apps/operations
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /tasks/* -> task management
 * - /live-checkinout/* -> live gate monitoring analytics
 * - /inventory/* -> inventory management
 */

import express from 'express';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import liveCheckInOutRoutes from './modules/live-checkinout/live-checkinout.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';

const router = express.Router();

router.use('/tasks', tasksRoutes);
router.use('/live-checkinout', liveCheckInOutRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
