/**
 * Profiles Self Routes
 * Student-facing dashboard/profile and ID card routes.
 *
 * Base path: /api/v1/students/profiles-self
 */

import express from 'express';
import {
  getStudentProfile,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
} from './profiles-self.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../../utils/permissions.js';

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', authorizeRoles(['Student']), getStudentDashboard);
router.get('/profile', authorizeRoles(['Student']), getStudentProfile);
router.get(
  '/:userId/id-card',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requirePermission('students_info', 'view'),
  getStudentIdCard
);
router.post('/:userId/id-card', authorizeRoles(['Student']), uploadStudentIdCard);

export default router;
