/**
 * @fileoverview Complaints App Entry Point
 * @description Main router for complaint management modules
 * @module apps/complaints
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /complaint/* -> Complaint management routes
 */

import express from 'express';
import complaintsRoutes from './modules/complaints/complaints.routes.js';

const router = express.Router();

router.use('/complaint', complaintsRoutes);

export default router;
