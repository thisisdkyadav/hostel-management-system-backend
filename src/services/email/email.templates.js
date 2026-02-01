/**
 * Email Templates
 * HTML templates for various email types
 *
 * @module services/email/email.templates
 */

/**
 * Base email wrapper with consistent styling
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
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f7fa;
      color: #333;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background-color: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px 40px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      color: #ffffff;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 8px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
    }
    .content {
      padding: 40px;
    }
    .content h2 {
      margin: 0 0 20px;
      color: #333;
      font-size: 20px;
    }
    .content p {
      margin: 0 0 16px;
      line-height: 1.6;
      color: #555;
    }
    .button {
      display: inline-block;
      padding: 14px 32px;
      margin: 20px 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
    }
    .button:hover {
      opacity: 0.9;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 24px 40px;
      text-align: center;
      border-top: 1px solid #eee;
    }
    .footer p {
      margin: 0;
      font-size: 12px;
      color: #888;
    }
    .warning {
      background-color: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      padding: 12px 16px;
      margin: 16px 0;
      font-size: 13px;
      color: #856404;
    }
    .code {
      background-color: #f4f7fa;
      border-radius: 4px;
      padding: 12px 16px;
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 2px;
      text-align: center;
      margin: 16px 0;
      color: #333;
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
      <p>IIT Indore</p>
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
    <p class="warning">
      <strong>Important:</strong> This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support if you have concerns.
    </p>
    <p>If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="word-break: break-all; font-size: 13px; color: #667eea;">${resetLink}</p>
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

export default {
  baseEmailTemplate,
  passwordResetTemplate,
  passwordResetSuccessTemplate,
  customEmailTemplate,
};
