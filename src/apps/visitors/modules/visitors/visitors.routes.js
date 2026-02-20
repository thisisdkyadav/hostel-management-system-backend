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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const VISITORS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.visitors',
  [ROLES.WARDEN]: 'route.warden.visitors',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.visitors',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.visitors',
  [ROLES.STUDENT]: 'route.student.visitors',
  [ROLES.HOSTEL_GATE]: 'route.hostelGate.visitors',
  [ROLES.SECURITY]: 'route.security.attendance',
};

const requireVisitorsRouteAccess = (req, res, next) => {
  const routeKey = VISITORS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Visitor request summary
router.get(
  '/requests/summary',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  requireVisitorsRouteAccess,
  getVisitorRequests
);

// Student-specific visitor requests
router.get(
  '/requests/student/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireVisitorsRouteAccess,
  getStudentVisitorRequests
);

// Visitor request operations
router.get(
  '/requests/:requestId',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
    'Student',
  ]),
  requireVisitorsRouteAccess,
  getVisitorRequestById
);
router.post(
  '/requests',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  createVisitorRequest
);
router.put(
  '/requests/:requestId',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  updateVisitorRequest
);
router.delete(
  '/requests/:requestId',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  deleteVisitorRequest
);

// Visitor profiles (Student only)
router.get(
  '/profiles',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  getVisitorProfiles
);
router.post(
  '/profiles',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  createVisitorProfile
);
router.put(
  '/profiles/:visitorId',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  updateVisitorProfile
);
router.delete(
  '/profiles/:visitorId',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  deleteVisitorProfile
);

// Room allocation for visitor requests
router.post(
  '/requests/:requestId/allocate',
  authorizeRoles(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireVisitorsRouteAccess,
  allocateRoomsToVisitorRequest
);

// Check-in/out operations
router.post(
  '/requests/:requestId/checkin',
  authorizeRoles(['Hostel Gate']),
  requireVisitorsRouteAccess,
  checkInVisitor
);
router.post(
  '/requests/:requestId/checkout',
  authorizeRoles(['Hostel Gate']),
  requireVisitorsRouteAccess,
  checkOutVisitor
);
router.put(
  '/requests/:requestId/update-check-times',
  authorizeRoles(['Hostel Gate']),
  requireVisitorsRouteAccess,
  updateCheckTime
);

// Request status update
router.post(
  '/requests/:requestId/:action',
  authorizeRoles(['Admin']),
  requireVisitorsRouteAccess,
  updateVisitorRequestStatus
);

// Payment info update
router.put(
  '/requests/:requestId/payment-info',
  authorizeRoles(['Student']),
  requireVisitorsRouteAccess,
  updatePaymentInfo
);

export default router;
