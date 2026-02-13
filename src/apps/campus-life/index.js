/**
 * @fileoverview Campus-Life App Entry Point
 * @description Main router for campus life and community workflows
 * @module apps/campus-life
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /event/* -> hostel events
 * - /lost-and-found/* -> lost and found operations
 */

import express from 'express';
import eventsRoutes from './modules/events/events.routes.js';
import lostAndFoundRoutes from './modules/lost-and-found/lost-and-found.routes.js';

const router = express.Router();

router.use('/event', eventsRoutes);
router.use('/lost-and-found', lostAndFoundRoutes);

export default router;
