/**
 * @fileoverview Administration App Entry Point
 * @description Main router for cross-role administration workflows
 * @module apps/administration
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /family/* -> admin/staff family-member management
 */

import express from 'express';
import familyRoutes from './modules/family/family.routes.js';

const router = express.Router();

router.use('/family', familyRoutes);

export default router;
