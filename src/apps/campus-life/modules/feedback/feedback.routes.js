/**
 * Feedback Routes
 * Handles student feedback management
 * 
 * Base path: /api/v1/feedback
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
} from './feedback.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.feedbacks',
  [ROLES.WARDEN]: 'route.warden.feedbacks',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.feedbacks',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.feedbacks',
  [ROLES.STUDENT]: 'route.student.feedbacks',
});

// All routes require authentication
router.use(authenticate);

// Student feedback submission
router.post(
  '/add',
  guard(['Student']),
  createFeedback
);

// Get all feedbacks
router.get(
  '/',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  getFeedbacks
);

// Get student-specific feedbacks
router.get(
  '/student/:userId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getStudentFeedbacks
);

// Student-only feedback updates
router.put(
  '/:feedbackId',
  guard(['Student']),
  updateFeedback
);
router.delete(
  '/:feedbackId',
  guard(['Student']),
  deleteFeedback
);

// Staff feedback management
router.put(
  '/update-status/:feedbackId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  updateFeedbackStatus
);
router.post(
  '/reply/:feedbackId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  replyToFeedback
);

export default router;
