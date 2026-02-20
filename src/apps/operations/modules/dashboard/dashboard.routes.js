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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const DASHBOARD_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.dashboard',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard',
  [ROLES.WARDEN]: 'route.warden.dashboard',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.dashboard',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.dashboard',
};

const requireDashboardRouteAccess = (req, res, next) => {
  const routeKey = DASHBOARD_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Main dashboard - admin level access
router.get(
  '/',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDashboardRouteAccess,
  getDashboardData
);

// Warden hostel statistics
router.get(
  '/warden/hostel-statistics',
  authorizeRoles(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireDashboardRouteAccess,
  getWardenHostelStatistics
);

// Student statistics
router.get(
  '/student-count',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireDashboardRouteAccess,
  getStudentCount
);
router.get(
  '/student-statistics',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireDashboardRouteAccess,
  getStudentStatistics
);

// Hostel statistics (commented in original)
// router.get('/hostels', ...)

// Events data (commented in original)
// router.get('/events', ...)

// Complaints statistics (commented in original)
// router.get('/complaints', ...)

export default router;
