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
 * - /online-users/* -> online presence tracking
 * - /security/* -> security gate workflows
 * - /face-scanner/* -> scanner device + management workflows
 * - /dashboard/* -> operational dashboard analytics
 */

import express from 'express';
import tasksRoutes from './modules/tasks/tasks.routes.js';
import liveCheckInOutRoutes from './modules/live-checkinout/live-checkinout.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import staffAttendanceRoutes from './modules/staff-attendance/staff-attendance.routes.js';
import hostelRoomsRoutes from './modules/hostel-rooms/hostel-rooms.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import sheetRoutes from './modules/sheet/sheet.routes.js';
import onlineUsersRoutes from './modules/online-users/online-users.routes.js';
import securityRoutes from './modules/security/security.routes.js';
import faceScannerRoutes from './modules/face-scanner/face-scanner.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';

const router = express.Router();

router.use('/tasks', tasksRoutes);
router.use('/live-checkinout', liveCheckInOutRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/staff', staffAttendanceRoutes);
router.use('/hostel', hostelRoomsRoutes);
router.use('/leave', leaveRoutes);
router.use('/sheet', sheetRoutes);
router.use('/online-users', onlineUsersRoutes);
router.use('/security', securityRoutes);
router.use('/face-scanner', faceScannerRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
