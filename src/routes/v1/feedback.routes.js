/**
 * Feedback Routes
 * Handles student feedback management
 * 
 * Base path: /api/feedback
 */

import express from 'express';
import {
  createFeedback,
  getStudentFeedbacks,
  getFeedbacks,
  updateFeedbackStatus,
  replyToFeedback,
  updateFeedback,
  deleteFeedback,
} from '../../controllers/feedbackController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Student feedback submission
router.post('/add', authorizeRoles(['Student']), createFeedback);

// Get all feedbacks
router.get(
  '/',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requirePermission('feedback', 'view'),
  getFeedbacks
);

// Get student-specific feedbacks
router.get(
  '/student/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getStudentFeedbacks
);

// Student-only feedback updates
router.put('/:feedbackId', authorizeRoles(['Student']), updateFeedback);
router.delete('/:feedbackId', authorizeRoles(['Student']), deleteFeedback);

// Staff feedback management
router.put(
  '/update-status/:feedbackId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  updateFeedbackStatus
);
router.post(
  '/reply/:feedbackId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  replyToFeedback
);

export default router;
