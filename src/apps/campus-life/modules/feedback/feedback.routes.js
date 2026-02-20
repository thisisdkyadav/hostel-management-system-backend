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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const FEEDBACK_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.feedbacks',
  [ROLES.WARDEN]: 'route.warden.feedbacks',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.feedbacks',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.feedbacks',
  [ROLES.STUDENT]: 'route.student.feedbacks',
};

const requireFeedbackRouteAccess = (req, res, next) => {
  const routeKey = FEEDBACK_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Student feedback submission
router.post(
  '/add',
  authorizeRoles(['Student']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.create']),
  createFeedback
);

// Get all feedbacks
router.get(
  '/',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.view']),
  getFeedbacks
);

// Get student-specific feedbacks
router.get(
  '/student/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.view', 'cap.students.detail.view', 'cap.students.view']),
  getStudentFeedbacks
);

// Student-only feedback updates
router.put(
  '/:feedbackId',
  authorizeRoles(['Student']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.create']),
  updateFeedback
);
router.delete(
  '/:feedbackId',
  authorizeRoles(['Student']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.create']),
  deleteFeedback
);

// Staff feedback management
router.put(
  '/update-status/:feedbackId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.react']),
  updateFeedbackStatus
);
router.post(
  '/reply/:feedbackId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireFeedbackRouteAccess,
  requireAnyCapability(['cap.feedback.react']),
  replyToFeedback
);

export default router;
