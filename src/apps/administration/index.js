/**
 * @fileoverview Administration App Entry Point
 * @description Main router for cross-role administration workflows
 * @module apps/administration
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /family/* -> admin/staff family-member management
 * - /config/* -> system configuration management
 * - /email/* -> custom email operations
 * - /upload/* -> file upload operations
 */

import express from 'express';
import familyRoutes from './modules/family/family.routes.js';
import configRoutes from './modules/config/config.routes.js';
import emailRoutes from './modules/email/email.routes.js';
import uploadRoutes from './modules/upload/upload.routes.js';

const router = express.Router();

router.use('/family', familyRoutes);
router.use('/config', configRoutes);
router.use('/email', emailRoutes);
router.use('/upload', uploadRoutes);

export default router;
