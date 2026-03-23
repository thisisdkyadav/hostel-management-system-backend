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
  electionSupportConfirmationTemplate,
  electionVotingBallotTemplate,
  electionNominationReviewTemplate,
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

    const originalRecipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    const shouldRedirectInDevelopment =
      env.isDevelopment && Boolean(env.smtp.developmentRedirectTo);
    const effectiveRecipients = shouldRedirectInDevelopment
      ? [env.smtp.developmentRedirectTo]
      : originalRecipients;
    const originalRecipientLabel = originalRecipients.join(", ");

    try {
      const effectiveHtml = shouldRedirectInDevelopment
        ? `
          <div style="margin-bottom: 16px; padding: 12px 16px; border-radius: 8px; background: #FEF3C7; color: #92400E; font-size: 13px;">
            Development email redirect active. Original recipient(s): <strong>${originalRecipientLabel || "Unknown"}</strong>
          </div>
          ${html}
        `
        : html;
      const effectiveText = shouldRedirectInDevelopment
        ? `Development email redirect active. Original recipient(s): ${originalRecipientLabel || "Unknown"}\n\n${
            text || this.stripHtml(html)
          }`
        : text || this.stripHtml(html);
      const normalizedAttachments = this.normalizeAttachments(attachments);
      const mailOptions = {
        from: env.smtp.from,
        to: effectiveRecipients.join(', '),
        subject,
        html: effectiveHtml,
        text: effectiveText,
        attachments: normalizedAttachments,
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('Email sent successfully', {
        to: effectiveRecipients,
        originalRecipients,
        subject,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send email', {
        to: effectiveRecipients,
        originalRecipients,
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

  async sendElectionSupportConfirmationEmail({
    email,
    supporterName,
    candidateName,
    candidateRollNumber,
    electionTitle,
    postTitle,
    supportRole,
    confirmationToken,
  }) {
    const confirmationLink = `${env.FRONTEND_URL}/election-support-confirmation/${confirmationToken}`;
    const html = electionSupportConfirmationTemplate({
      supporterName,
      candidateName,
      candidateRollNumber,
      electionTitle,
      postTitle,
      supportRole,
      confirmationLink,
    });

    return this.sendEmail({
      to: email,
      subject: `Election Support Confirmation Required · ${postTitle}`,
      html,
    });
  }

  async sendElectionVotingBallotEmail({
    email,
    studentName,
    electionTitle,
    votingStartAt,
    votingEndAt,
    postCount,
    ballotToken,
    isMockElection = false,
  }) {
    const ballotLink = `${env.FRONTEND_URL}/election-ballot/${ballotToken}`;
    const html = electionVotingBallotTemplate({
      studentName,
      electionTitle,
      votingStartAt,
      votingEndAt,
      postCount,
      ballotLink,
      isMockElection,
    });

    return this.sendEmail({
      to: email,
      subject: `Election Voting Link · ${electionTitle}`,
      html,
    });
  }

  async sendElectionNominationReviewEmail({
    email,
    studentName,
    electionTitle,
    postTitle,
    decision,
    reviewNotes,
  }) {
    const decisionConfig = {
      verified: {
        label: "Verified",
        subject: `Nomination Verified · ${postTitle}`,
        introMessage: `Your nomination for ${postTitle || "this post"} in ${electionTitle || "the election"} has been verified.`,
      },
      rejected: {
        label: "Rejected",
        subject: `Nomination Rejected · ${postTitle}`,
        introMessage: `Your nomination for ${postTitle || "this post"} in ${electionTitle || "the election"} has been rejected.`,
      },
      modification_requested: {
        label: "Modification Requested",
        subject: `Nomination Modification Required · ${postTitle}`,
        introMessage: `Your nomination for ${postTitle || "this post"} in ${electionTitle || "the election"} needs changes before it can be reviewed again.`,
      },
    }

    const currentDecision = decisionConfig[String(decision || "").trim()] || {
      label: "Updated",
      subject: `Nomination Update · ${postTitle || electionTitle || "Election"}`,
      introMessage: "Your election nomination has been reviewed.",
    }

    const html = electionNominationReviewTemplate({
      studentName,
      electionTitle,
      postTitle,
      decisionLabel: currentDecision.label,
      introMessage: currentDecision.introMessage,
      reviewNotes,
    })

    return this.sendEmail({
      to: email,
      subject: currentDecision.subject,
      html,
    })
  }
}

export const emailService = new EmailService();
export default EmailService;
