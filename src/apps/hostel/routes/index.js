/**
 * API Routes v1 Index
 * Aggregates all v1 API routes
 * 
 * This file exports all route modules for use in the main server
 * while maintaining the same API endpoints for backward compatibility.
 */

// User Management
export { default as adminRoutes } from './admin.routes.js';
export { default as wardenRoutes } from './warden.routes.js';
export { default as securityRoutes } from './security.routes.js';
export { default as superAdminRoutes } from './superAdmin.routes.js';

// Hostel Management
export { default as dashboardRoutes } from './dashboard.routes.js';

// Student Management
export { default as familyMemberRoutes } from './familyMember.routes.js';

// Events & Lost and Found
export { default as eventRoutes } from './event.routes.js';
export { default as lostAndFoundRoutes } from './lostAndFound.routes.js';

// Attendance & Leave
export { default as leaveRoutes } from './leave.routes.js';

// Face Scanner
export { default as faceScannerRoutes } from './faceScanner.routes.js';

// Notifications
export { default as notificationRoutes } from './notification.routes.js';

// Feedback
export { default as feedbackRoutes } from './feedback.routes.js';

// Certificates & Undertakings
export { default as certificateRoutes } from './certificate.routes.js';
export { default as undertakingRoutes } from './undertaking.routes.js';

// Disciplinary Committee
export { default as disCoRoutes } from './disco.routes.js';

// Configuration
export { default as configRoutes } from './config.routes.js';

// Payments
export { default as paymentRoutes } from './payment.routes.js';

// Uploads
export { default as uploadRoutes } from './upload.routes.js';

// Statistics & Reporting
export { default as statsRoutes } from './stats.routes.js';
export { default as onlineUsersRoutes } from './onlineUsers.routes.js';
export { default as sheetRoutes } from './sheet.routes.js';
