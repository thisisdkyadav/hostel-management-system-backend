/**
 * @fileoverview Visitors App Entry Point
 * @description Main router for visitor domain modules
 * @module apps/visitors
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /visitor/* -> Visitor request/profile management
 */

import express from 'express';
import visitorsRoutes from './modules/visitors/visitors.routes.js';

const router = express.Router();

router.use('/visitor', visitorsRoutes);

export default router;

