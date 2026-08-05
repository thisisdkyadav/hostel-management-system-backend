/**
 * Live Check-In/Out Routes
 * Handles real-time check-in/out monitoring and analytics
 * 
 * Base path: /api/v1/live-checkinout
 */

import express from 'express';
import {
  getLiveCheckInOutEntries,
  getHostelWiseStats,
  getRecentActivity,
  getTimeBasedAnalytics,
} from './live-checkinout.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin']));
const guard = routeGuard({
  Admin: 'route.admin.liveCheckInOut',
  'Super Admin': 'route.superAdmin.dashboard',
});

router.use(guard.access);

// Get live check-in/out entries with filters
router.get('/entries', getLiveCheckInOutEntries);

// Get hostel-wise statistics
router.get('/stats/hostel-wise', getHostelWiseStats);

// Get recent activity timeline
router.get('/recent', getRecentActivity);

// Get time-based analytics
router.get('/analytics/time-based', getTimeBasedAnalytics);

export default router;
