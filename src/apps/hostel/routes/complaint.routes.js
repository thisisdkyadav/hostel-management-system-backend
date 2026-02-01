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
} from '../controllers/complaintController.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

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
  requirePermission('complaints', 'create'),
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
  requirePermission('complaints', 'view'),
  getAllComplaints
);

// Get student-specific complaints
router.get(
  '/student/complaints/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudentComplaints
);

// Complaint status updates
router.put(
  '/update-status/:id',
  authorizeRoles(['Maintenance Staff']),
  updateComplaintStatus
);
router.put(
  '/:complaintId/status',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  complaintStatusUpdate
);

// Complaint resolution notes
router.put(
  '/:complaintId/resolution-notes',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  updateComplaintResolutionNotes
);

// Complaint feedback
router.post(
  '/:complaintId/feedback',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
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
  getStats
);

export default router;
