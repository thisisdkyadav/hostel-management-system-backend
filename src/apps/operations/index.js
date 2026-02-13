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
 * - /staff/* -> staff attendance operations
 * - /hostel/* -> room/unit/allocation operations
 * - /leave/* -> leave management
 * - /sheet/* -> allocation reporting
 */

import express from 'express';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import liveCheckInOutRoutes from './modules/live-checkinout/live-checkinout.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import staffAttendanceRoutes from './modules/staff-attendance/staff-attendance.routes.js';
import hostelRoomsRoutes from './modules/hostel-rooms/hostel-rooms.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import sheetRoutes from './modules/sheet/sheet.routes.js';

const router = express.Router();

router.use('/tasks', tasksRoutes);
router.use('/live-checkinout', liveCheckInOutRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/staff', staffAttendanceRoutes);
router.use('/hostel', hostelRoomsRoutes);
router.use('/leave', leaveRoutes);
router.use('/sheet', sheetRoutes);

export default router;
