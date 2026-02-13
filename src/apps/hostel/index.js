/**
 * @fileoverview Hostel Management App Entry Point
 * @description Main router for the Hostel Management application
 * @module apps/hostel
 *
 * This app contains remaining hostel management functionality that has
 * not yet been extracted to dedicated major apps.
 */

import express from 'express';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE IMPORTS
// ═══════════════════════════════════════════════════════════════════════════════

import wardenRoutes from './routes/warden.routes.js';
import adminRoutes from './routes/admin.routes.js';
import securityRoutes from './routes/security.routes.js';
import statsRoutes from './routes/stats.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import disCoRoutes from './routes/disco.routes.js';
import certificateRoutes from './routes/certificate.routes.js';
// Payment routes removed - unused feature
import superAdminRoutes from './routes/superAdmin.routes.js';
import familyMemberRoutes from './routes/familyMember.routes.js';
import undertakingRoutes from './routes/undertaking.routes.js';
import onlineUsersRoutes from './routes/onlineUsers.routes.js';
import faceScannerRoutes from './routes/faceScanner.routes.js';
import sheetRoutes from './routes/sheet.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import configRoutes from './routes/config.routes.js';
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

// Student
router.use('/family', familyMemberRoutes);

// Hostel
router.use('/dashboard', dashboardRoutes);

// Notifications
router.use('/notification', notificationRoutes);

// Email
router.use('/email', emailRoutes);

// Certificates & DisCo
router.use('/certificate', certificateRoutes);
router.use('/disCo', disCoRoutes);
router.use('/undertaking', undertakingRoutes);

// Attendance & Leave
router.use('/leave', leaveRoutes);

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
