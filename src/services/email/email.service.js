/**
 * Email Service
 * Core email sending functionality using nodemailer
 *
 * @module services/email/email.service
 */

import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../../config/env.config.js';
import logger from '../base/Logger.js';
import {
  passwordResetTemplate,
  passwordResetSuccessTemplate,
  customEmailTemplate,
  complaintResolvedTemplate,
} from './email.templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.join(__dirname, '..', '..', '..', 'uploads');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  /**
   * Initialize the nodemailer transporter
   */
  initializeTransporter() {
    if (!env.smtp.user || !env.smtp.pass) {
      logger.warn('SMTP credentials not configured. Email sending is disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure, // true for 465, false for other ports
        auth: {
          user: env.smtp.user,
          pass: env.smtp.pass,
        },
      });

      this.isConfigured = true;
      logger.info('Email service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize email transporter', { error: error.message });
    }
  }

  /**
   * Verify SMTP connection
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async verifyConnection() {
    if (!this.isConfigured) {
      return { success: false, error: 'SMTP not configured' };
    }

    try {
      await this.transporter.verify();
      logger.info('SMTP connection verified successfully');
      return { success: true };
    } catch (error) {
      logger.error('SMTP connection verification failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a single email
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.html - HTML content
   * @param {string} [options.text] - Plain text fallback
   * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
   */
  async sendEmail({ to, subject, html, text, attachments = [] }) {
    if (!this.isConfigured) {
      logger.warn('Email not sent - SMTP not configured', { to, subject });
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const normalizedAttachments = this.normalizeAttachments(attachments);
      const mailOptions = {
        from: env.smtp.from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text: text || this.stripHtml(html),
        attachments: normalizedAttachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to,
        subject,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send email', {
        to,
        subject,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk emails individually (better for privacy)
   * @param {string[]} recipients - Array of recipient emails
   * @param {string} subject - Email subject
   * @param {string} html - HTML content
   * @param {string} [text] - Plain text fallback
   * @returns {Promise<{success: boolean, sent: number, failed: number, errors: string[]}>}
   */
  async sendBulkEmails(recipients, subject, html, text, attachments = []) {
    if (!this.isConfigured) {
      return { success: false, sent: 0, failed: recipients.length, errors: ['Email service not configured'] };
    }

    const results = {
      sent: 0,
      failed: 0,
      errors: [],
    };

    // Send emails individually for privacy
    for (const recipient of recipients) {
      const result = await this.sendEmail({ to: recipient, subject, html, text, attachments });
      
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${recipient}: ${result.error}`);
      }

      // Small delay to avoid rate limiting
      await this.delay(100);
    }

    return {
      success: results.failed === 0,
      ...results,
    };
  }

  /**
   * Send password reset email
   * @param {string} email - Recipient email
   * @param {string} resetToken - Password reset token
   * @param {string} userName - User's name
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendPasswordResetEmail(email, resetToken, userName) {
    const resetLink = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const html = passwordResetTemplate(userName, resetLink);

    return this.sendEmail({
      to: email,
      subject: 'Reset Your HMS Password',
      html,
    });
  }

  /**
   * Send password reset success notification
   * @param {string} email - Recipient email
   * @param {string} userName - User's name
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendPasswordResetSuccessEmail(email, userName) {
    const html = passwordResetSuccessTemplate(userName);

    return this.sendEmail({
      to: email,
      subject: 'Your HMS Password Has Been Changed',
      html,
    });
  }

  /**
   * Send custom email with template styling
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.body - Email body (HTML or plain text)
   * @param {boolean} [options.useTemplate=true] - Wrap in base template
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendCustomEmail({ to, subject, body, useTemplate = true, attachments = [] }) {
    const html = useTemplate ? customEmailTemplate(body, subject) : body;

    if (Array.isArray(to) && to.length > 1) {
      // Bulk send for multiple recipients
      return this.sendBulkEmails(to, subject, html, undefined, attachments);
    }

    return this.sendEmail({ to, subject, html, attachments });
  }

  /**
   * Normalize attachment inputs to nodemailer attachment config.
   * Supports:
   * - { filename, path }
   * - { filename, url }
   * - { filename, fileUrl }
   */
  normalizeAttachments(rawAttachments = []) {
    if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
      return [];
    }

    const normalized = [];

    for (const attachment of rawAttachments) {
      if (!attachment) continue;
      const filename = attachment.filename || attachment.fileName || 'attachment.pdf';
      const filePath = attachment.path || attachment.url || attachment.fileUrl;
      if (!filePath || typeof filePath !== 'string') continue;

      if (filePath.startsWith('/uploads/')) {
        const relativePart = filePath.replace(/^\/uploads\//, '');
        const absolutePath = path.join(uploadsRoot, relativePart);
        if (fs.existsSync(absolutePath)) {
          normalized.push({ filename, path: absolutePath });
        }
        continue;
      }

      if (/^https?:\/\//i.test(filePath)) {
        normalized.push({ filename, path: filePath });
        continue;
      }

      if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
        normalized.push({ filename, path: filePath });
      }
    }

    return normalized;
  }

  /**
   * Strip HTML tags for plain text fallback
   * @param {string} html - HTML content
   * @returns {string} Plain text
   */
  stripHtml(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Delay helper for rate limiting
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send complaint resolved email with feedback link
   * @param {Object} options - Email options
   * @param {string} options.email - Recipient email
   * @param {string} options.studentName - Student's name
   * @param {string} options.complaintTitle - Complaint title
   * @param {string} options.complaintCategory - Complaint category
   * @param {string} options.resolutionNotes - Resolution notes
   * @param {string} options.feedbackToken - Feedback token for URL
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendComplaintResolvedEmail({
    email,
    studentName,
    complaintTitle,
    complaintCategory,
    resolutionNotes,
    feedbackToken,
  }) {
    const feedbackLink = `${env.FRONTEND_URL}/complaint-feedback/${feedbackToken}`;
    const html = complaintResolvedTemplate({
      studentName,
      complaintTitle,
      complaintCategory,
      resolutionNotes,
      feedbackLink,
    });

    return this.sendEmail({
      to: email,
      subject: 'Your Complaint Has Been Resolved - Please Share Your Feedback',
      html,
    });
  }
}

export const emailService = new EmailService();
export default EmailService;
