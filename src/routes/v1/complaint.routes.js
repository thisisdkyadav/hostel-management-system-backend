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
} from '../../../controllers/complaintController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';
import { validate } from '../../validations/validate.middleware.js';
import {
  createComplaintSchema,
  getAllComplaintsSchema,
  getStudentComplaintsSchema,
  updateComplaintStatusSchema,
  updateComplaintResolutionNotesSchema,
  updateComplaintFeedbackSchema,
} from '../../validations/complaint.validation.js';

const router = express.Router();

// All routes require authentication
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
  validate(createComplaintSchema),
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
  validate(getAllComplaintsSchema),
  getAllComplaints
);

// Get student-specific complaints
router.get(
  '/student/complaints/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  validate(getStudentComplaintsSchema),
  getStudentComplaints
);

// Complaint status updates
router.put(
  '/update-status/:id',
  authorizeRoles(['Maintenance Staff']),
  validate(updateComplaintStatusSchema),
  updateComplaintStatus
);
router.put(
  '/:complaintId/status',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  validate(updateComplaintStatusSchema),
  complaintStatusUpdate
);

// Complaint resolution notes
router.put(
  '/:complaintId/resolution-notes',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Maintenance Staff']),
  validate(updateComplaintResolutionNotesSchema),
  updateComplaintResolutionNotes
);

// Complaint feedback
router.post(
  '/:complaintId/feedback',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  validate(updateComplaintFeedbackSchema),
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
