/**
 * Email Routes
 * Handles custom email sending operations
 *
 * Base path: /api/v1/email
 */

import express from 'express';
import { sendEmail, checkStatus } from './email.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { sendEmailSchema } from '../../../../validations/email.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  Admin: 'route.admin.settings',
  'Super Admin': 'route.superAdmin.dashboard',
});

/**
 * @route   GET /api/email/status
 * @desc    Check email service status
 * @access  Private (Admin, Super Admin)
 */
router.get(
  '/status',
  guard(['Admin', 'Super Admin']),
  checkStatus
);

/**
 * @route   POST /api/email/send
 * @desc    Send custom email (individual or group)
 * @access  Private (Admin, Super Admin)
 */
router.post(
  '/send',
  guard(['Admin', 'Super Admin']),
  validate(sendEmailSchema),
  sendEmail
);

export default router;
