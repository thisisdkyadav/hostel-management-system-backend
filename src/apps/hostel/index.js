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
import statsRoutes from './routes/stats.routes.js';
import uploadRoutes from './routes/upload.routes.js';
// Payment routes removed - unused feature
import superAdminRoutes from './routes/superAdmin.routes.js';
import familyMemberRoutes from './routes/familyMember.routes.js';
import configRoutes from './routes/config.routes.js';
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
router.use('/super-admin', superAdminRoutes);

// Student
router.use('/family', familyMemberRoutes);

// Email
router.use('/email', emailRoutes);

// Configuration
router.use('/config', configRoutes);

// Statistics & Reporting
router.use('/stats', statsRoutes);

// Upload (needs special handling - see express.loader.js)
router.use('/upload', uploadRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
