/**
 * Email Service
 * Core email sending functionality using nodemailer
 *
 * @module services/email/email.service
 */

import nodemailer from 'nodemailer';
import { env } from '../../config/env.config.js';
import logger from '../base/Logger.js';
import { fileAccessService } from '../storage/file-access.service.js';
import {
  customEmailTemplate,
  complaintResolvedTemplate,
  electionSupportConfirmationTemplate,
  electionVotingBallotTemplate,
  electionNominationReviewTemplate,
  electionTestEmailTemplate,
} from './email.templates.js';

class EmailService {
  constructor() {
    this.singleTransporterEntry = null;
    this.multiTransporters = [];
    this.isConfigured = false;
    this.nextMultiTransporterIndex = 0;
    this.singleSendQueue = Promise.resolve();
    this.multiSendQueue = Promise.resolve();
    this.singleLastSendCompletedAt = 0;
    this.multiLastSendCompletedAt = 0;
    this.initializeTransporter();
  }

  /**
   * Initialize the nodemailer transporter
   */
  initializeTransporter() {
    const singleAccount = this.getSingleAccount();
    const multiAccounts = this.getMultiAccounts();

    if (!singleAccount && multiAccounts.length === 0) {
      logger.warn('SMTP credentials not configured. Email sending is disabled.');
      return;
    }

    try {
      if (singleAccount) {
        this.singleTransporterEntry = this.createTransporterEntry(singleAccount);
      }

      this.multiTransporters = multiAccounts.map((account) => this.createTransporterEntry(account));

      if (!this.singleTransporterEntry && this.multiTransporters.length > 0) {
        this.singleTransporterEntry = this.multiTransporters[0];
      }

      this.isConfigured = true;
      logger.info('Email service initialized successfully', {
        singleSmtpUser: this.singleTransporterEntry?.user || "",
        multiSmtpAccounts: this.multiTransporters.length,
        sendIntervalMs: env.smtp.sendIntervalMs,
        sendAs: env.smtp.sendAs,
      });
    } catch (error) {
      logger.error('Failed to initialize email transporter', { error: error.message });
    }
  }

  getSingleAccount() {
    if (env.smtp.user && env.smtp.pass) {
      return {
        user: env.smtp.user,
        pass: env.smtp.pass,
      };
    }

    if (Array.isArray(env.smtp.accounts) && env.smtp.accounts.length > 0) {
      return env.smtp.accounts[0];
    }

    return null;
  }

  getMultiAccounts() {
    if (Array.isArray(env.smtp.accounts) && env.smtp.accounts.length > 0) {
      return env.smtp.accounts;
    }

    const singleAccount = this.getSingleAccount();
    return singleAccount ? [singleAccount] : [];
  }

  createTransporterEntry(account = {}) {
    return {
      user: account.user,
      transporter: nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        // nodemailer sets NO socket timeouts by default — a hung SMTP
        // connection stalls the sender forever and blocks every queued
        // email behind it (voting dispatch included).
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
        auth: {
          user: account.user,
          pass: account.pass,
        },
      }),
    };
  }

  getTransporterEntry(deliveryMode = 'single') {
    if (deliveryMode !== 'multi') {
      return this.singleTransporterEntry;
    }

    if (!Array.isArray(this.multiTransporters) || this.multiTransporters.length === 0) {
      return null;
    }

    const index = this.nextMultiTransporterIndex % this.multiTransporters.length;
    this.nextMultiTransporterIndex = (this.nextMultiTransporterIndex + 1) % this.multiTransporters.length;
    return this.multiTransporters[index];
  }

  queueEmailSend(task, { deliveryMode = 'single' } = {}) {
    const queueKey = deliveryMode === 'multi' ? 'multiSendQueue' : 'singleSendQueue';
    const lastCompletedAtKey =
      deliveryMode === 'multi' ? 'multiLastSendCompletedAt' : 'singleLastSendCompletedAt';

    const scheduledTask = this[queueKey].then(async () => {
      const elapsedSinceLastSend = Date.now() - this[lastCompletedAtKey];
      const waitMs = Math.max(0, env.smtp.sendIntervalMs - elapsedSinceLastSend);

      if (waitMs > 0) {
        await this.delay(waitMs);
      }

      try {
        return await task();
      } finally {
        this[lastCompletedAtKey] = Date.now();
      }
    });

    this[queueKey] = scheduledTask.catch(() => {});
    return scheduledTask;
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
      const transporterEntries = [
        ...(this.singleTransporterEntry ? [this.singleTransporterEntry] : []),
        ...this.multiTransporters,
      ];
      const uniqueEntries = transporterEntries.filter(
        (entry, index, collection) =>
          entry?.user &&
          collection.findIndex((candidate) => candidate?.user === entry.user) === index
      );

      await Promise.all(uniqueEntries.map(({ transporter }) => transporter.verify()));
      logger.info('SMTP connection verified successfully', {
        smtpAccounts: uniqueEntries.length,
      });
      return { success: true };
    } catch (error) {
      logger.error('SMTP connection verification failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Diagnostic: send one email per configured SMTP account, each explicitly
   * through its own transporter, and report per-account results. Used by the
   * admin "test SMTP accounts" tool to find credentials that fail silently
   * under round-robin delivery.
   * @param {Object} options
   * @param {string} options.to - Recipient email (receives one copy per account)
   * @param {string} options.subject
   * @param {string} options.html
   * @param {string} [options.text]
   * @returns {Promise<{success: boolean, error?: string, accounts: Array<{smtpUser: string, success: boolean, messageId?: string, error?: string, durationMs: number}>}>}
   */
  async sendViaAllAccounts({ to, subject, html, text }) {
    if (!this.isConfigured) {
      return { success: false, error: 'Email service not configured', accounts: [] };
    }

    const entries = (this.multiTransporters || []).filter((entry) => entry?.user);
    const uniqueEntries = entries.filter(
      (entry, index, collection) =>
        collection.findIndex((candidate) => candidate?.user === entry.user) === index
    );

    if (uniqueEntries.length === 0) {
      return { success: false, error: 'No SMTP accounts configured', accounts: [] };
    }

    // Hard per-account cap. Even with socket timeouts configured, race the
    // send so one wedged connection can never hang this diagnostic (or the
    // HTTP request behind it).
    const SEND_CAP_MS = 45_000;
    const cappedSend = (task) =>
      Promise.race([
        task,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out after ${SEND_CAP_MS / 1000}s`)), SEND_CAP_MS)
        ),
      ]);

    const accounts = [];
    for (const entry of uniqueEntries) {
      const startedAt = Date.now();
      try {
        // Route through the shared rate-limited queue so this diagnostic
        // never stampsede real traffic.
        const result = await cappedSend(
          this.queueEmailSend(
            () =>
              entry.transporter.sendMail({
                from: env.smtp.sendAs || env.smtp.from,
                replyTo: env.smtp.sendAs || env.smtp.from,
                to,
                subject,
                html,
                text: text || this.stripHtml(html),
              }),
            { deliveryMode: 'multi' }
          )
        );
        accounts.push({
          smtpUser: entry.user,
          success: true,
          messageId: result.messageId,
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        accounts.push({
          smtpUser: entry.user,
          success: false,
          error: error.message,
          durationMs: Date.now() - startedAt,
        });
      }
    }

    return {
      success: accounts.every((account) => account.success),
      accounts,
    };
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
  async sendEmail({ to, subject, html, text, attachments = [], deliveryMode = 'single' }) {
    if (!this.isConfigured) {
      logger.warn('Email not sent - SMTP not configured', { to, subject });
      return { success: false, error: 'Email service not configured' };
    }

    if (Array.isArray(to) && to.filter(Boolean).length > 1) {
      return this.sendBulkEmails(to, subject, html, text, attachments, { deliveryMode });
    }

    return this.sendSingleEmail({ to, subject, html, text, attachments, deliveryMode });
  }

  async sendSingleEmail({ to, subject, html, text, attachments = [], deliveryMode = 'single' }) {
    const transporterEntry = this.getTransporterEntry(deliveryMode);

    if (!transporterEntry) {
      logger.warn('Email not sent - no SMTP accounts configured', { to, subject });
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
      const normalizedAttachments = await this.normalizeAttachments(attachments);
      const result = await this.queueEmailSend(async () => {
        const mailOptions = {
          from: env.smtp.sendAs || env.smtp.from,
          replyTo: env.smtp.sendAs || env.smtp.from,
          to: effectiveRecipients.join(', '),
          subject,
          html: effectiveHtml,
          text: effectiveText,
          attachments: normalizedAttachments,
        };

        return transporterEntry.transporter.sendMail(mailOptions);
      }, { deliveryMode });
      
      logger.info('Email sent successfully', {
        to: effectiveRecipients,
        originalRecipients,
        subject,
        deliveryMode,
        smtpUser: transporterEntry.user,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error) {
      logger.error('Failed to send email', {
        to: effectiveRecipients,
        originalRecipients,
        subject,
        deliveryMode,
        smtpUser: transporterEntry.user,
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
  async sendBulkEmails(recipients, subject, html, text, attachments = [], { deliveryMode = 'single' } = {}) {
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
      const result = await this.sendSingleEmail({
        to: recipient,
        subject,
        html,
        text,
        attachments,
        deliveryMode,
      });
      
      if (result.success) {
        results.sent++;
      } else {
        results.failed++;
        results.errors.push(`${recipient}: ${result.error}`);
      }
    }

    return {
      success: results.failed === 0,
      ...results,
    };
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
   * - { filename, content, contentType }  (in-memory buffers, e.g. generated PDFs)
   * - { filename, path }
   * - { filename, url }
   * - { filename, fileUrl }
   */
  async normalizeAttachments(rawAttachments = []) {
    if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) {
      return [];
    }

    const normalized = [];

    for (const attachment of rawAttachments) {
      if (!attachment) continue;
      const filename = attachment.filename || attachment.fileName || 'attachment.pdf';

      if (attachment.content != null) {
        const item = { filename, content: attachment.content };
        if (attachment.contentType) item.contentType = attachment.contentType;
        if (attachment.encoding) item.encoding = attachment.encoding;
        if (attachment.cid) item.cid = attachment.cid;
        normalized.push(item);
        continue;
      }

      const filePath = attachment.path || attachment.url || attachment.fileUrl;
      if (!filePath || typeof filePath !== 'string') continue;

      if (/^https?:\/\//i.test(filePath)) {
        normalized.push({ filename, path: filePath });
        continue;
      }

      const legacyPath = fileAccessService.resolveLegacyPath(filePath);
      if (legacyPath) {
        normalized.push({ filename, path: legacyPath });
        continue;
      }

      try {
        const signedOrRawUrl = await fileAccessService.createSignedUrl(filePath, {
          disposition: 'attachment',
          expiresInSeconds: env.storage.signedUrlTtlSeconds,
        });

        if (signedOrRawUrl) {
          normalized.push({ filename, path: signedOrRawUrl });
        }
      } catch {
        // Ignore invalid attachments rather than failing the whole email send path.
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
    reminder = false,
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
      reminder,
    });

    return this.sendEmail({
      to: email,
      subject: `${reminder ? "Voting Reminder" : "Election Voting Link"} · ${electionTitle}`,
      html,
      deliveryMode: 'multi',
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

  async sendElectionTestEmail({
    email,
    studentName,
    electionTitle,
  }) {
    const html = electionTestEmailTemplate({
      studentName,
      electionTitle,
    })

    return this.sendEmail({
      to: email,
      subject: `Test Email · ${electionTitle || "Election"}`,
      html,
      deliveryMode: 'multi',
    })
  }
}

export const emailService = new EmailService();
export default EmailService;
