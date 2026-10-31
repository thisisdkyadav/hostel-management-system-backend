/**
 * Dining Period Notification
 * Sends the scheduled "registration window" email for dining periods whose
 * notificationAt has passed. Sent as BCC batches across the SMTP accounts
 * (see emailService.sendGroupEmail).
 */

import { eligibleProfileFilter } from '../../../../services/dining/diningEligibility.js';
import { env } from '../../../../config/env.config.js';
import { emailService } from '../../../../services/email/email.service.js';
import { customEmailTemplate } from '../../../../services/email/email.templates.js';
import { diningOwner } from '../../../../services/dining/diningOwner.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';

const formatDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const formatDateTime = (value) => new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const getRecipientEmails = async (period) => {
  const query = eligibleProfileFilter(period);
  if (!query) return [];
  const profiles = await studentProfileQueries.findByQueryWithUserRole(query);
  return profiles.map((profile) => profile.userId?.email).filter(Boolean);
};

const buildEmail = (period) => {
  const subject = `Dining registration open: ${formatDate(period.startDate)} – ${formatDate(period.endDate)}`;
  const body = `
    <p>Dear Student,</p>
    <p>Caterer registration for the dining period <strong>${formatDate(period.startDate)} – ${formatDate(period.endDate)}</strong> is scheduled.</p>
    <p><strong>Registration window:</strong> ${formatDateTime(period.allocationStartAt)} to ${formatDateTime(period.allocationEndAt)}</p>
    <p>Please log in and select your caterer within this window: <a href="${env.FRONTEND_URL}/student/dining">${env.FRONTEND_URL}/student/dining</a></p>
    <p>Seats are limited per caterer and are allotted on a first-come, first-served basis.</p>
  `;
  return { subject, html: customEmailTemplate(body, subject) };
};

export const sendDueDiningPeriodNotifications = async () => {
  let processed = 0;
  // Each claim atomically marks the period sent, so concurrent instances never double-send.
  for (let period = await diningOwner.claimDueNotificationPeriod(); period; period = await diningOwner.claimDueNotificationPeriod()) {
    processed += 1;
    try {
      const recipients = await getRecipientEmails(period);
      const { subject, html } = buildEmail(period);
      const result = await emailService.sendGroupEmail({ recipients, subject, html });
      console.log(`[scheduler] dining period ${period._id} notification: ${result.sent} sent, ${result.failed} failed in ${result.messages} message(s)`);
      if (result.failedRecipients.length > 0) {
        console.error(`[scheduler] dining period ${period._id} notification not delivered to:`, result.failedRecipients.join(', '));
      }
    } catch (error) {
      console.error(`[scheduler] dining period ${period._id} notification failed:`, error?.message || error);
    }
  }
  return processed;
};
