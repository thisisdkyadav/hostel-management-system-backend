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
import appointmentsRoutes from './modules/appointments/appointments.routes.js';
import accommodationRoutes from './modules/accommodation/accommodation.routes.js';
import h4Routes from './modules/intern-accommodation/h4.routes.js';

const router = express.Router();

router.use('/visitor', visitorsRoutes);
router.use('/accommodation', accommodationRoutes);
router.use('/intern-accommodation', h4Routes);
router.use('/appointments', appointmentsRoutes);
router.use('/jr-appointments', appointmentsRoutes);

export default router;
