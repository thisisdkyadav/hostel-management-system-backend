/**
 * Visitors Routes
 * Handles visitor requests, profiles, check-in/out
 * 
 * Base path: /api/v1/visitor
 */

import express from 'express';
import {
  createVisitorRequest,
  deleteVisitorRequest,
  getVisitorRequests,
  updateVisitorRequest,
  updateVisitorRequestStatus,
  allocateRoomsToVisitorRequest,
  getVisitorRequestById,
  checkInVisitor,
  checkOutVisitor,
  updateCheckTime,
  getStudentVisitorRequests,
  updatePaymentInfo,
} from './visitors.controller.js';
import {
  getVisitorProfiles,
  createVisitorProfile,
  deleteVisitorProfile,
  updateVisitorProfile,
} from './visitor-profile.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.visitors',
  [ROLES.WARDEN]: 'route.warden.visitors',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.visitors',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.visitors',
  [ROLES.STUDENT]: 'route.student.visitors',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.visitors',
  [ROLES.SECURITY]: 'route.security.attendance',
});

// All routes require authentication
router.use(authenticate);

// Visitor request summary
router.get(
  '/requests/summary',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  getVisitorRequests
);

// Student-specific visitor requests
router.get(
  '/requests/student/:userId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentVisitorRequests
);

// Visitor request operations
router.get(
  '/requests/:requestId',
  guard([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  getVisitorRequestById
);
router.post(
  '/requests',
  guard(['Student']),
  createVisitorRequest
);
router.put(
  '/requests/:requestId',
  guard(['Student']),
  updateVisitorRequest
);
router.delete(
  '/requests/:requestId',
  guard(['Student']),
  deleteVisitorRequest
);

// Visitor profiles (Student only)
router.get(
  '/profiles',
  guard(['Student']),
  getVisitorProfiles
);
router.post(
  '/profiles',
  guard(['Student']),
  createVisitorProfile
);
router.put(
  '/profiles/:visitorId',
  guard(['Student']),
  updateVisitorProfile
);
router.delete(
  '/profiles/:visitorId',
  guard(['Student']),
  deleteVisitorProfile
);

// Room allocation for visitor requests
router.post(
  '/requests/:requestId/allocate',
  guard(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  allocateRoomsToVisitorRequest
);

// Check-in/out operations
router.post(
  '/requests/:requestId/checkin',
  guard(['Hostel Gate']),
  checkInVisitor
);
router.post(
  '/requests/:requestId/checkout',
  guard(['Hostel Gate']),
  checkOutVisitor
);
router.put(
  '/requests/:requestId/update-check-times',
  guard(['Hostel Gate']),
  updateCheckTime
);

// Request status update
router.post(
  '/requests/:requestId/:action',
  guard(['Admin']),
  updateVisitorRequestStatus
);

// Payment info update
router.put(
  '/requests/:requestId/payment-info',
  guard(['Student']),
  updatePaymentInfo
);

export default router;
