/**
 * Live Check-In/Out Routes
 * Handles real-time check-in/out monitoring and analytics
 * 
 * Base path: /api/live-checkinout
 */

import express from 'express';
import {
  getLiveCheckInOutEntries,
  getHostelWiseStats,
  getRecentActivity,
  getTimeBasedAnalytics,
} from '../../../controllers/liveCheckInOutController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication and admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin']));

// Get live check-in/out entries with filters
router.get('/entries', getLiveCheckInOutEntries);

// Get hostel-wise statistics
router.get('/stats/hostel-wise', getHostelWiseStats);

// Get recent activity timeline
router.get('/recent', getRecentActivity);

// Get time-based analytics
router.get('/analytics/time-based', getTimeBasedAnalytics);

export default router;
