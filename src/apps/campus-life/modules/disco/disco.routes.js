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
  submitProcessCase,
  getMyProcessCases,
  getAdminProcessCases,
  getProcessCaseById,
  reviewProcessCase,
  addCaseStatement,
  removeCaseStatement,
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
router.delete('/:disCoId', authorizeRoles(['Admin']), deleteDisCoAction);

// Student disciplinary process case submission and view
router.post('/process/cases', authorizeRoles(['Student']), submitProcessCase);
router.get('/process/my-cases', authorizeRoles(['Student']), getMyProcessCases);

// Admin disciplinary process workflows
router.get('/process/cases', authorizeRoles(['Admin', 'Super Admin']), getAdminProcessCases);
router.get('/process/cases/:caseId', authorizeRoles(['Admin', 'Super Admin', 'Student']), getProcessCaseById);
router.patch('/process/cases/:caseId/review', authorizeRoles(['Admin', 'Super Admin']), reviewProcessCase);
router.post('/process/cases/:caseId/statements', authorizeRoles(['Admin', 'Super Admin']), addCaseStatement);
router.delete(
  '/process/cases/:caseId/statements/:statementId',
  authorizeRoles(['Admin', 'Super Admin']),
  removeCaseStatement
);
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
