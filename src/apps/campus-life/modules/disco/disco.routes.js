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
  markDisCoReminderDone,
  deleteDisCoAction,
  submitProcessCase,
  getAdminProcessCases,
  getProcessCaseById,
  saveCaseStageTwo,
  sendCaseEmail,
  uploadCommitteeMinutes,
  finalizeProcessCase,
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
router.patch('/update/:disCoId/reminders/:reminderItemId/done', markDisCoReminderDone);
router.delete('/:disCoId', authorizeRoles(['Admin']), deleteDisCoAction);

// Admin disciplinary process workflows
router.post('/process/cases', authorizeRoles(['Admin', 'Super Admin']), submitProcessCase);
router.get('/process/cases', authorizeRoles(['Admin', 'Super Admin']), getAdminProcessCases);
router.get('/process/cases/:caseId', authorizeRoles(['Admin', 'Super Admin']), getProcessCaseById);
router.patch('/process/cases/:caseId/stage2', authorizeRoles(['Admin', 'Super Admin']), saveCaseStageTwo);
router.post('/process/cases/:caseId/send-email', authorizeRoles(['Admin', 'Super Admin']), sendCaseEmail);
router.patch(
  '/process/cases/:caseId/committee-minutes',
  authorizeRoles(['Admin', 'Super Admin']),
  uploadCommitteeMinutes
);
router.patch('/process/cases/:caseId/finalize', authorizeRoles(['Admin', 'Super Admin']), finalizeProcessCase);

// Get DisCo actions by student
router.get(
  '/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getDisCoActionsByStudent
);

export default router;
