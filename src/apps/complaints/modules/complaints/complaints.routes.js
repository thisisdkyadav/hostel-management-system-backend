/**
 * Complaint Routes
 * Handles complaint management for all users
 * 
 * Base path: /api/complaint
 */

import express from 'express';
import {
  createComplaint,
  getAllComplaints,
  updateComplaintStatus,
  getStats,
  getStudentComplaints,
  complaintStatusUpdate,
  updateComplaintResolutionNotes,
  updateComplaintFeedback,
  getComplaintByToken,
  submitFeedbackByToken,
} from './complaints.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const COMPLAINTS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.complaints',
  [ROLES.WARDEN]: 'route.warden.complaints',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.complaints',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.complaints',
  [ROLES.STUDENT]: 'route.student.complaints',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.dashboard',
};

const requireComplaintsRouteAccess = (req, res, next) => {
  const routeKey = COMPLAINTS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// ========== PUBLIC ROUTES (no authentication) ==========

// Get complaint by feedback token (for email link)
router.get('/feedback/:token', getComplaintByToken);

// Submit feedback using token (from email link)
router.post('/feedback/:token', submitFeedbackByToken);

// ========== PROTECTED ROUTES ==========
// All routes below require authentication
router.use(authenticate);

// Create complaint
router.post(
  '/',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Maintenance Staff',
    'Student',
  ]),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.create']),
  createComplaint
);

// Get all complaints
router.get(
  '/all',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Maintenance Staff',
    'Student',
  ]),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.view']),
  getAllComplaints
);

// Get student-specific complaints
router.get(
  '/student/complaints/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.view', 'cap.students.detail.view', 'cap.students.view']),
  getStudentComplaints
);

// Complaint status updates
router.put(
  '/update-status/:id',
  authorizeRoles(['Maintenance Staff']),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.resolve', 'cap.complaints.review']),
  updateComplaintStatus
);
router.put(
  '/:complaintId/status',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.resolve', 'cap.complaints.review']),
  complaintStatusUpdate
);

// Complaint resolution notes
router.put(
  '/:complaintId/resolution-notes',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.resolve']),
  updateComplaintResolutionNotes
);

// Complaint feedback
router.post(
  '/:complaintId/feedback',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.create', 'cap.complaints.view']),
  updateComplaintFeedback
);

// Statistics
router.get(
  '/stats',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Maintenance Staff',
    'Student',
  ]),
  requireComplaintsRouteAccess,
  requireAnyCapability(['cap.complaints.view']),
  getStats
);

export default router;
