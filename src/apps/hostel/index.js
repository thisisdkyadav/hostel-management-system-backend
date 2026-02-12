/**
 * @fileoverview Hostel Management App Entry Point
 * @description Main router for the Hostel Management application
 * @module apps/hostel
 *
 * This app contains all the existing hostel management functionality:
 * - Student management
 * - Complaint handling
 * - Visitor management
 * - Events & Lost and Found
 * - Hostel & Room management
 * - Payment & Certificates
 * - Staff & Attendance
 * - And more...
 */

import express from 'express';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import wardenRoutes from './routes/warden.routes.js';
import studentRoutes from './routes/student.routes.js';
import adminRoutes from './routes/admin.routes.js';
import complaintRoutes from './routes/complaint.routes.js';
import LostAndFoundRoutes from './routes/lostAndFound.routes.js';
import securityRoutes from './routes/security.routes.js';
import eventRoutes from './routes/event.routes.js';
import hostelRoutes from './routes/hostel.routes.js';
import statsRoutes from './routes/stats.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import visitorRoutes from './routes/visitor.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import disCoRoutes from './routes/disco.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
// Payment routes removed - unused feature
import superAdminRoutes from './routes/superAdmin.routes.js';
import familyMemberRoutes from './routes/familyMember.routes.js';
import staffAttendanceRoutes from './routes/staffAttendance.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import permissionRoutes from './routes/permission.routes.js';
import taskRoutes from './routes/task.routes.js';
import userRoutes from './routes/user.routes.js';
import undertakingRoutes from './routes/undertaking.routes.js';
import onlineUsersRoutes from './routes/onlineUsers.routes.js';
import liveCheckInOutRoutes from './routes/liveCheckInOut.routes.js';
import faceScannerRoutes from './routes/faceScanner.routes.js';
import sheetRoutes from './routes/sheet.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import configRoutes from './routes/config.routes.js';
import studentProfileRoutes from './routes/studentProfile.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import emailRoutes from './routes/email.routes.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (req, res) => {
  res.json({
    success: true,
    app: 'hostel-management',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE MOUNTING
// ═══════════════════════════════════════════════════════════════════════════════

// User management
router.use('/warden', wardenRoutes);
router.use('/admin', adminRoutes);
router.use('/security', securityRoutes);
router.use('/super-admin', superAdminRoutes);
router.use('/users', userRoutes);
router.use('/permissions', permissionRoutes);

// Student
router.use('/student', studentRoutes);
router.use('/student-profile', studentProfileRoutes);
router.use('/family', familyMemberRoutes);

// Hostel
router.use('/hostel', hostelRoutes);
router.use('/dashboard', dashboardRoutes);

// Complaints
router.use('/complaint', complaintRoutes);

// Events & Lost and Found
router.use('/event', eventRoutes);
router.use('/lost-and-found', LostAndFoundRoutes);

// Visitor
router.use('/visitor', visitorRoutes);

// Feedback
router.use('/feedback', feedbackRoutes);

// Notifications
router.use('/notification', notificationRoutes);

// Email
router.use('/email', emailRoutes);

// Certificates & DisCo
router.use('/certificate', certificateRoutes);
router.use('/disCo', disCoRoutes);
router.use('/undertaking', undertakingRoutes);

// Inventory
router.use('/inventory', inventoryRoutes);

// Attendance & Leave
router.use('/staff', staffAttendanceRoutes);
router.use('/leave', leaveRoutes);
router.use('/live-checkinout', liveCheckInOutRoutes);

// Tasks
router.use('/tasks', taskRoutes);

// Configuration
router.use('/config', configRoutes);

// Statistics & Reporting
router.use('/stats', statsRoutes);
router.use('/online-users', onlineUsersRoutes);
router.use('/sheet', sheetRoutes);

// Face Scanner
router.use('/face-scanner', faceScannerRoutes);

// Upload (needs special handling - see express.loader.js)
router.use('/upload', uploadRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
