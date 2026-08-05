/**
 * Dashboard Routes
 * Handles dashboard data and statistics
 * 
 * Base path: /api/v1/dashboard
 */

import express from 'express';
import {
  getDashboardData,
  getStudentStatistics,
  getHostelStatistics,
  getEventsData,
  getComplaintsStatistics,
  getStudentCount,
  getWardenHostelStatistics,
} from './dashboard.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.dashboard',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard',
  [ROLES.WARDEN]: 'route.warden.dashboard',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.dashboard',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.dashboard',
});

// All routes require authentication
router.use(authenticate);

// Main dashboard - admin level access
router.get(
  '/',
  guard(['Admin', 'Super Admin']),
  getDashboardData
);

// Warden hostel statistics
router.get(
  '/warden/hostel-statistics',
  guard(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  getWardenHostelStatistics
);

// Student statistics
router.get(
  '/student-count',
  guard(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentCount
);
router.get(
  '/student-statistics',
  guard(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentStatistics
);

// Hostel statistics (commented in original)
// router.get('/hostels', ...)

// Events data (commented in original)
// router.get('/events', ...)

// Complaints statistics (commented in original)
// router.get('/complaints', ...)

export default router;
