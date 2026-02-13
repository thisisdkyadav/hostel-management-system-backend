/**
 * Email Controller
 * Handles HTTP layer for custom email sending operations
 *
 * @module controllers/emailController
 */

import { asyncHandler, sendRawResponse } from '../../../../utils/index.js';
import { emailCustomService } from './email.service.js';

/**
 * Send custom email
 * POST /api/email/send
 * @access Private (Admin, Super Admin)
 */
export const sendEmail = asyncHandler(async (req, res) => {
  const { to, subject, body, sendType, attachments } = req.body;

  const result = await emailCustomService.sendCustomEmail({
    to,
    subject,
    body,
    sendType,
    attachments,
    sentBy: req.user,
  });

  sendRawResponse(res, result);
});

/**
 * Check email service status
 * GET /api/email/status
 * @access Private (Admin, Super Admin)
 */
export const checkStatus = asyncHandler(async (req, res) => {
  const result = await emailCustomService.checkEmailServiceStatus();
  sendRawResponse(res, result);
});
