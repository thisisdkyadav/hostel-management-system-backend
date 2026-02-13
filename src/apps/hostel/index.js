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

// Payment routes removed - unused feature

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

// No remaining domain routes in hostel app; kept for health checks during migration.

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
