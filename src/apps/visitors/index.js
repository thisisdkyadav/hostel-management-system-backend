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
import jrAppointmentsRoutes from './modules/jr-appointments/jr-appointments.routes.js';

const router = express.Router();

router.use('/visitor', visitorsRoutes);
router.use('/jr-appointments', jrAppointmentsRoutes);

export default router;
