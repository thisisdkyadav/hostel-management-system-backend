/**
 * @fileoverview Administration App Entry Point
 * @description Main router for cross-role administration workflows
 * @module apps/administration
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /family/* -> admin/staff family-member management
 * - /config/* -> system configuration management
 */

import express from 'express';
import familyRoutes from './modules/family/family.routes.js';
import configRoutes from './modules/config/config.routes.js';

const router = express.Router();

router.use('/family', familyRoutes);
router.use('/config', configRoutes);

export default router;
