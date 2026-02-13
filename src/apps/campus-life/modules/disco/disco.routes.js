/**
 * DisCo (Disciplinary Committee) Routes
 * Handles disciplinary actions for students
 * 
 * Base path: /api/v1/disCo
 */

import express from 'express';
import {
  addDisCoAction,
  getDisCoActionsByStudent,
  updateDisCoAction,
  deleteDisCoAction,
} from './disco.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin-only DisCo management
router.post('/add', authorizeRoles(['Admin']), addDisCoAction);
router.put('/update/:disCoId', authorizeRoles(['Admin']), updateDisCoAction);
router.delete('/:disCoId', authorizeRoles(['Admin']), deleteDisCoAction);

// Get DisCo actions by student
router.get(
  '/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getDisCoActionsByStudent
);

export default router;
