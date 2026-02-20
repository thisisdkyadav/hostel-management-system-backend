/**
 * Email Routes
 * Handles custom email sending operations
 *
 * Base path: /api/v1/email
 */

import express from 'express';
import { sendEmail, checkStatus } from './email.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { sendEmailSchema } from '../../../../validations/email.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const EMAIL_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.settings',
  'Super Admin': 'route.superAdmin.dashboard',
};

const requireEmailRouteAccess = (req, res, next) => {
  const routeKey = EMAIL_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

/**
 * @route   GET /api/email/status
 * @desc    Check email service status
 * @access  Private (Admin, Super Admin)
 */
router.get(
  '/status',
  authorizeRoles(['Admin', 'Super Admin']),
  requireEmailRouteAccess,
  checkStatus
);

/**
 * @route   POST /api/email/send
 * @desc    Send custom email (individual or group)
 * @access  Private (Admin, Super Admin)
 */
router.post(
  '/send',
  authorizeRoles(['Admin', 'Super Admin']),
  requireEmailRouteAccess,
  validate(sendEmailSchema),
  sendEmail
);

export default router;
