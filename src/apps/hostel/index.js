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
// Payment routes removed - unused feature
import superAdminRoutes from './routes/superAdmin.routes.js';

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

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
