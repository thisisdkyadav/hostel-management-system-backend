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
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin']));
const LIVE_CHECKINOUT_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.liveCheckInOut',
  'Super Admin': 'route.superAdmin.dashboard',
};

const requireLiveCheckInOutRouteAccess = (req, res, next) => {
  const routeKey = LIVE_CHECKINOUT_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

router.use(requireLiveCheckInOutRouteAccess);
router.use(requireAnyCapability(['cap.liveCheckInOut.view']));

// Get live check-in/out entries with filters
router.get('/entries', getLiveCheckInOutEntries);

// Get hostel-wise statistics
router.get('/stats/hostel-wise', getHostelWiseStats);

// Get recent activity timeline
router.get('/recent', getRecentActivity);

// Get time-based analytics
router.get('/analytics/time-based', getTimeBasedAnalytics);

export default router;
