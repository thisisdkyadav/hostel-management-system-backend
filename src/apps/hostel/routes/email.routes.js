/**
 * Email Routes
 * Handles custom email sending operations
 *
 * Base path: /api/email
 */

import express from 'express';
import { sendEmail, checkStatus } from '../controllers/emailController.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { sendEmailSchema } from '../../../validations/email.validation.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/email/status
 * @desc    Check email service status
 * @access  Private (Admin, Super Admin)
 */
router.get(
  '/status',
  authorizeRoles(['Admin', 'Super Admin']),
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
  validate(sendEmailSchema),
  sendEmail
);

export default router;
