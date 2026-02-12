/**
 * @fileoverview Students App Entry Point
 * @description Main router for student domain modules
 * @module apps/students
 *
 * @routes
 * All routes are prefixed with /api/v1/students
 */

import express from 'express';
import profilesAdminRoutes from './modules/profiles-admin/profiles-admin.routes.js';
import profilesSelfRoutes from './modules/profiles-self/profiles-self.routes.js';
import studentProfileRoutes from './modules/student-profile/student-profile.routes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    app: 'students',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

router.use('/profile', studentProfileRoutes);
router.use('/profiles-admin', profilesAdminRoutes);
router.use('/profiles-self', profilesSelfRoutes);

export default router;
