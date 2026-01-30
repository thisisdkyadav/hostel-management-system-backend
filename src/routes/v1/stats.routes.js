/**
 * Stats Routes
 * Handles various statistics endpoints
 * 
 * Base path: /api/stats
 */

import express from 'express';
import {
  getComplaintsStats,
  getHostelStats,
  getLostAndFoundStats,
  getSecurityStaffStats,
  getMaintenanceStaffStats,
  getRoomStats,
  getRoomChangeRequestStats,
  getVisitorStats,
  getEventStats,
  getWardenStats,
} from '../../controllers/statsController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// All routes require authentication
// Note: No role-based authorization in original implementation

// Hostel stats
router.get('/hostel', authenticate, getHostelStats);

// Lost and Found stats
router.get('/lostandfound', authenticate, getLostAndFoundStats);

// Security Staff stats
router.get('/security', authenticate, getSecurityStaffStats);

// Maintenance Staff stats
router.get('/maintenancestaff', authenticate, getMaintenanceStaffStats);

// Room stats
router.get('/room/:hostelId', authenticate, getRoomStats);

// Room Change Request stats
router.get('/room-change-requests/:hostelId', authenticate, getRoomChangeRequestStats);

// Visitor stats
router.get('/visitor/:hostelId', authenticate, getVisitorStats);

// Event stats
router.get('/event/:hostelId', authenticate, getEventStats);

// Warden stats
router.get('/wardens', authenticate, getWardenStats);

// Complaint stats
router.get('/complaints', authenticate, getComplaintsStats);

export default router;
