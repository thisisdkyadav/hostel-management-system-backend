/**
 * Email Templates
 * HTML templates for various email types
 *
 * @module services/email/email.templates
 */

/**
 * Base email wrapper with consistent styling
 * Uses colors from frontend/src/theme.css
 * @param {string} content - Email body content
 * @returns {string} Full HTML email
 */
export const baseEmailTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HMS Notification</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: 'Roboto', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #F0F4F9; /* --color-bg-page */
      color: #334155; /* --color-text-body */
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #FFFFFF; /* --color-bg-primary */
      border-radius: 16px; /* --radius-card */
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); /* --shadow-md */
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #1360AB, #2E7BC4); /* --gradient-primary */
      padding: 32px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #FFFFFF;
      font-size: 28px;
      font-weight: 700; /* --font-weight-bold */
      letter-spacing: -0.025em; /* --letter-spacing-tight */
    }
    .header p {
      margin: 8px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px; /* --font-size-base */
    }
    .content {
      padding: 40px;
    }
    .content h2 {
      margin: 0 0 20px;
      color: #0A1628; /* --color-text-primary */
      font-size: 20px; /* --font-size-2xl */
      font-weight: 600; /* --font-weight-semibold */
    }
    .content p {
      margin: 0 0 16px;
      line-height: 1.625; /* --line-height-relaxed */
      color: #334155; /* --color-text-body */
      font-size: 14px; /* --font-size-base */
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      margin: 20px 0;
      background: linear-gradient(135deg, #1360AB, #2E7BC4); /* --gradient-primary */
      color: #FFFFFF !important;
      text-decoration: none;
      border-radius: 12px; /* --radius-button-md */
      font-weight: 600; /* --font-weight-semibold */
      font-size: 14px; /* --font-size-base */
      box-shadow: 0 4px 15px rgba(19, 96, 171, 0.25); /* --shadow-button-primary */
      transition: all 0.2s ease;
    }
    .button:hover {
      background: linear-gradient(135deg, #0F4C81, #1360AB); /* --gradient-primary-hover */
      box-shadow: 0 4px 15px rgba(19, 96, 171, 0.35); /* --shadow-button-primary-hover */
    }
    .footer {
      background-color: #F8FAFC; /* --color-bg-tertiary */
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #E2E8F0; /* --color-border-primary */
    }
    .footer p {
      margin: 0;
      font-size: 12px; /* --font-size-xs */
      color: #64748B; /* --color-text-muted */
    }
    .warning {
      background-color: #FEF3C7; /* --color-warning-bg */
      border-left: 4px solid #F59E0B; /* --color-warning */
      border-radius: 8px; /* --radius-md */
      padding: 14px 18px;
      margin: 16px 0;
      font-size: 13px; /* --font-size-sm */
      color: #92400E; /* --color-warning-text */
    }
    .success-box {
      background-color: #DCFCE7; /* --color-success-bg */
      border-left: 4px solid #22C55E; /* --color-success */
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0;
    }
    .info-box {
      background-color: #E8F1FE; /* --color-primary-bg */
      border-left: 4px solid #1360AB; /* --color-primary */
      border-radius: 8px;
      padding: 16px 20px;
      margin: 16px 0;
    }
    .code {
      background-color: #F8FAFC; /* --color-bg-tertiary */
      border: 1px solid #E2E8F0; /* --color-border-primary */
      border-radius: 8px;
      padding: 14px 18px;
      font-family: 'Roboto Mono', monospace;
      font-size: 18px;
      letter-spacing: 2px;
      text-align: center;
      margin: 16px 0;
      color: #0A1628; /* --color-text-primary */
    }
    .muted-text {
      color: #64748B; /* --color-text-muted */
      font-size: 13px;
    }
    .link-text {
      color: #1360AB; /* --color-primary */
      font-size: 13px;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HMS</h1>
      <p>Hostel Management System</p>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from the Hostel Management System.</p>
      <p style="margin-top: 4px;">IIT Indore</p>
    </div>
  </div>
</body>
</html>
`;

/**
 * Password reset email template
 * @param {string} userName - User's name
 * @param {string} resetLink - Password reset URL
 * @returns {string} HTML email content
 */
export const passwordResetTemplate = (userName, resetLink) => {
  const content = `
    <h2>Password Reset Request</h2>
    <p>Hello ${userName || 'User'},</p>
    <p>We received a request to reset your password for your HMS account. Click the button below to create a new password:</p>
    <div style="text-align: center;">
      <a href="${resetLink}" class="button">Reset Password</a>
    </div>
    <div class="warning">
      <strong>Important:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    </div>
    <p class="muted-text">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="link-text">${resetLink}</p>
  `;
  return baseEmailTemplate(content);
};

/**
 * Password reset success email template
 * @param {string} userName - User's name
 * @returns {string} HTML email content
 */
export const passwordResetSuccessTemplate = (userName) => {
  const content = `
    <h2>Password Changed Successfully</h2>
    <p>Hello ${userName || 'User'},</p>
    <p>Your password has been successfully changed. You can now log in with your new password.</p>
    <p class="warning">
      <strong>Security Notice:</strong> If you did not make this change, please contact support immediately.
    </p>
  `;
  return baseEmailTemplate(content);
};

/**
 * Custom email template
 * Wraps custom content in base template styling
 * @param {string} body - Custom email body (can include HTML)
 * @param {string} subject - Email subject for header
 * @returns {string} HTML email content
 */
export const customEmailTemplate = (body, subject = 'Notification') => {
  const content = `
    <h2>${subject}</h2>
    <div>${body}</div>
  `;
  return baseEmailTemplate(content);
};

/**
 * Complaint resolved email template
 * Sent to student when their complaint is marked as resolved
 * @param {Object} params - Template parameters
 * @param {string} params.studentName - Student's name
 * @param {string} params.complaintTitle - Complaint title
 * @param {string} params.complaintCategory - Complaint category
 * @param {string} params.resolutionNotes - Resolution notes from staff
 * @param {string} params.feedbackLink - Link to submit feedback
 * @returns {string} HTML email content
 */
export const complaintResolvedTemplate = ({ 
  studentName, 
  complaintTitle, 
  complaintCategory, 
  resolutionNotes, 
  feedbackLink 
}) => {
  const content = `
    <h2>Your Complaint Has Been Resolved</h2>
    <p>Hello ${studentName || 'Student'},</p>
    <p>Great news! Your complaint has been resolved by the maintenance team.</p>
    
    <div class="success-box">
      <h3 style="margin: 0 0 12px; color: #0A1628; font-size: 16px; font-weight: 600;">${complaintTitle}</h3>
      <p style="margin: 0 0 8px; font-size: 13px; color: #334155;">
        <strong>Category:</strong> ${complaintCategory}
      </p>
      ${resolutionNotes ? `
        <p style="margin: 8px 0 0; font-size: 13px; color: #334155;">
          <strong>Resolution Notes:</strong> ${resolutionNotes}
        </p>
      ` : ''}
    </div>
    
    <p>We'd love to hear your feedback! Please take a moment to rate the resolution and let us know if the issue was fixed to your satisfaction.</p>
    
    <div style="text-align: center;">
      <a href="${feedbackLink}" class="button">Submit Feedback</a>
    </div>
    
    <div class="warning">
      <strong>Note:</strong> This feedback link is valid for 30 days. Your feedback helps us improve our services.
    </div>
    
    <p class="muted-text">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="link-text">${feedbackLink}</p>
  `;
  return baseEmailTemplate(content);
};

export default {
  baseEmailTemplate,
  passwordResetTemplate,
  passwordResetSuccessTemplate,
  customEmailTemplate,
  complaintResolvedTemplate,
};

