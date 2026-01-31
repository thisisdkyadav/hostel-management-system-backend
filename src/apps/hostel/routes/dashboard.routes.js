/**
 * Dashboard Routes
 * Handles dashboard data and statistics
 * 
 * Base path: /api/dashboard
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
} from '../controllers/dashboardController.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Main dashboard - admin level access
router.get('/', authorizeRoles(['Admin', 'Super Admin']), getDashboardData);

// Warden hostel statistics
router.get(
  '/warden/hostel-statistics',
  authorizeRoles(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  getWardenHostelStatistics
);

// Student statistics
router.get(
  '/student-count',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudentCount
);
router.get(
  '/student-statistics',
  authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudentStatistics
);

// Hostel statistics (commented in original)
// router.get('/hostels', ...)

// Events data (commented in original)
// router.get('/events', ...)

// Complaints statistics (commented in original)
// router.get('/complaints', ...)

export default router;
