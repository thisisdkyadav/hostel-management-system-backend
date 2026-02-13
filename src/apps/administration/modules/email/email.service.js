/**
 * Email Custom Service
 * Business logic for sending custom emails
 *
 * @module services/email.custom.service
 */

import { emailService } from '../../../../services/email/index.js';
import { ServiceResponse } from '../../../../services/base/ServiceResponse.js';
import logger from '../../../../services/base/Logger.js';

class EmailCustomService {
  /**
   * Send custom email(s)
   * @param {Object} options - Email options
   * @param {string|string[]} options.to - Recipient email(s)
   * @param {string} options.subject - Email subject
   * @param {string} options.body - Email body (HTML or plain text)
   * @param {string} options.sendType - 'individual' or 'group'
   * @param {Object} options.sentBy - User who sent the email
   * @returns {Promise<ServiceResponse>}
   */
  async sendCustomEmail({ to, subject, body, sendType = 'individual', sentBy }) {
    try {
      // Normalize recipients to array
      const recipients = Array.isArray(to) ? to : [to];

      logger.info('Sending custom email', {
        recipientCount: recipients.length,
        sendType,
        sentBy: sentBy?.email || 'unknown',
        subject,
      });

      let result;

      if (sendType === 'group' || recipients.length > 1) {
        // Send to each recipient individually (better for privacy)
        result = await emailService.sendCustomEmail({
          to: recipients,
          subject,
          body,
          useTemplate: true,
        });

        if (result.success) {
          return ServiceResponse.success(
            {
              sent: result.sent,
              failed: result.failed,
              total: recipients.length,
            },
            200,
            `Email sent to ${result.sent} of ${recipients.length} recipients`
          );
        } else {
          return ServiceResponse.success(
            {
              sent: result.sent || 0,
              failed: result.failed || recipients.length,
              errors: result.errors || [],
              total: recipients.length,
            },
            200,
            `Email sent with some failures: ${result.sent} sent, ${result.failed} failed`
          );
        }
      } else {
        // Single recipient
        result = await emailService.sendCustomEmail({
          to: recipients[0],
          subject,
          body,
          useTemplate: true,
        });

        if (result.success) {
          return ServiceResponse.success(
            {
              sent: 1,
              failed: 0,
              total: 1,
              messageId: result.messageId,
            },
            200,
            'Email sent successfully'
          );
        } else {
          return ServiceResponse.error(
            `Failed to send email: ${result.error}`,
            500
          );
        }
      }
    } catch (error) {
      logger.error('Error in sendCustomEmail', { error: error.message });
      return ServiceResponse.error(
        'Failed to send email. Please try again later.',
        500,
        error.message
      );
    }
  }

  /**
   * Check if email service is configured and ready
   * @returns {Promise<ServiceResponse>}
   */
  async checkEmailServiceStatus() {
    const status = await emailService.verifyConnection();

    if (status.success) {
      return ServiceResponse.success(
        { configured: true, status: 'ready' },
        200,
        'Email service is configured and ready'
      );
    } else {
      return ServiceResponse.success(
        { configured: false, status: 'not_configured', error: status.error },
        200,
        'Email service is not properly configured'
      );
    }
  }
}

export const emailCustomService = new EmailCustomService();
export default EmailCustomService;
