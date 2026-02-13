/**
 * @fileoverview Campus-Life App Entry Point
 * @description Main router for campus life and community workflows
 * @module apps/campus-life
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /event/* -> hostel events
 * - /lost-and-found/* -> lost and found operations
 * - /feedback/* -> feedback operations
 * - /notification/* -> notifications
 * - /undertaking/* -> undertaking workflows
 * - /disCo/* -> disciplinary committee actions
 */

import express from 'express';
import eventsRoutes from './modules/events/events.routes.js';
import lostAndFoundRoutes from './modules/lost-and-found/lost-and-found.routes.js';
import feedbackRoutes from './modules/feedback/feedback.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import undertakingsRoutes from './modules/undertakings/undertakings.routes.js';
import disCoRoutes from './modules/disco/disco.routes.js';

const router = express.Router();

router.use('/event', eventsRoutes);
router.use('/lost-and-found', lostAndFoundRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/notification', notificationsRoutes);
router.use('/undertaking', undertakingsRoutes);
router.use('/disCo', disCoRoutes);

export default router;
