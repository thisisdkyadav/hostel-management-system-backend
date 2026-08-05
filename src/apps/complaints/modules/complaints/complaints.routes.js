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
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

// role -> routeKey guard for this module (replaces the hand-rolled
// ROUTE_KEY_BY_ROLE map + requireComplaintsRouteAccess wrapper)
const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.complaints',
  [ROLES.WARDEN]: 'route.warden.complaints',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.complaints',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.complaints',
  [ROLES.STUDENT]: 'route.student.complaints',
  [ROLES.MAINTENANCE_STAFF]: 'route.maintenance.dashboard',
});

// ========== PUBLIC ROUTES (no authentication) ==========

// Get complaint by feedback token (for email link)
router.get('/feedback/:token', getComplaintByToken);

// Submit feedback using token (from email link)
router.post('/feedback/:token', submitFeedbackByToken);

// ========== PROTECTED ROUTES ==========
// All routes below require authentication
router.use(authenticate);

// Create complaint
router.post('/', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff', 'Student']), createComplaint);

// Get all complaints
router.get('/all', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff', 'Student']), getAllComplaints);

// Get student-specific complaints
router.get('/student/complaints/:userId', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']), getStudentComplaints);

// Complaint status updates
router.put('/update-status/:id', guard(['Maintenance Staff']), updateComplaintStatus);
router.put('/:complaintId/status', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']), complaintStatusUpdate);

// Complaint resolution notes
router.put('/:complaintId/resolution-notes', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']), updateComplaintResolutionNotes);

// Complaint feedback
router.post('/:complaintId/feedback', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']), updateComplaintFeedback);

// Statistics
router.get('/stats', guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff', 'Student']), getStats);

export default router;
