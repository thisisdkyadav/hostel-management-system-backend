/**
 * @fileoverview Campus-Life App Entry Point
 * @description Main router for campus life and community workflows
 * @module apps/campus-life
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /event/* -> hostel events
 */

import express from 'express';
import eventsRoutes from './modules/events/events.routes.js';

const router = express.Router();

router.use('/event', eventsRoutes);

export default router;
