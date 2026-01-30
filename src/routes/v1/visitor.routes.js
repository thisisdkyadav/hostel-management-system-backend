/**
 * Visitor Routes
 * Handles visitor requests, profiles, check-in/out
 * 
 * Base path: /api/visitor
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
} from '../../controllers/visitorController.js';
import {
  getVisitorProfiles,
  createVisitorProfile,
  deleteVisitorProfile,
  updateVisitorProfile,
} from '../../controllers/visitorProfileController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

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
  getVisitorRequests
);

// Student-specific visitor requests
router.get(
  '/requests/student/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
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
  getVisitorRequestById
);
router.post('/requests', authorizeRoles(['Student']), createVisitorRequest);
router.put('/requests/:requestId', authorizeRoles(['Student']), updateVisitorRequest);
router.delete('/requests/:requestId', authorizeRoles(['Student']), deleteVisitorRequest);

// Visitor profiles (Student only)
router.get('/profiles', authorizeRoles(['Student']), getVisitorProfiles);
router.post('/profiles', authorizeRoles(['Student']), createVisitorProfile);
router.put('/profiles/:visitorId', authorizeRoles(['Student']), updateVisitorProfile);
router.delete('/profiles/:visitorId', authorizeRoles(['Student']), deleteVisitorProfile);

// Room allocation for visitor requests
router.post(
  '/requests/:requestId/allocate',
  authorizeRoles(['Warden', 'Associate Warden', 'Hostel Supervisor']),
  allocateRoomsToVisitorRequest
);

// Check-in/out operations
router.post('/requests/:requestId/checkin', authorizeRoles(['Hostel Gate']), checkInVisitor);
router.post('/requests/:requestId/checkout', authorizeRoles(['Hostel Gate']), checkOutVisitor);
router.put(
  '/requests/:requestId/update-check-times',
  authorizeRoles(['Hostel Gate']),
  updateCheckTime
);

// Request status update
router.post(
  '/requests/:requestId/:action',
  authorizeRoles(['Admin']),
  updateVisitorRequestStatus
);

// Payment info update
router.put('/requests/:requestId/payment-info', authorizeRoles(['Student']), updatePaymentInfo);

export default router;
