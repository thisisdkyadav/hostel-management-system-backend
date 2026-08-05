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
  exportProcessCaseBundle,
  saveCaseStageTwo,
  sendCaseEmail,
  skipCaseEmail,
  uploadCommitteeMinutes,
  finalizeProcessCase,
} from './disco.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guardStudent = routeGuard({
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
});

const guardProcess = routeGuard({
  [ROLES.ADMIN]: 'route.admin.disciplinaryProcess',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard',
});

// All routes require authentication
router.use(authenticate);

// Admin-only DisCo management
router.post(
  '/add',
  guardStudent(['Admin']),
  addDisCoAction
);
router.put(
  '/update/:disCoId',
  guardStudent(['Admin']),
  updateDisCoAction
);
router.patch(
  '/update/:disCoId/reminders/:reminderItemId/done',
  guardStudent(['Admin']),
  markDisCoReminderDone
);
router.delete(
  '/:disCoId',
  guardStudent(['Admin']),
  deleteDisCoAction
);

// Admin disciplinary process workflows
router.post(
  '/process/cases',
  guardProcess(['Admin', 'Super Admin']),
  submitProcessCase
);
router.get(
  '/process/cases',
  guardProcess(['Admin', 'Super Admin']),
  getAdminProcessCases
);
router.get(
  '/process/cases/:caseId',
  guardProcess(['Admin', 'Super Admin']),
  getProcessCaseById
);
router.get(
  '/process/cases/:caseId/export',
  guardProcess(['Admin', 'Super Admin']),
  exportProcessCaseBundle
);
router.patch(
  '/process/cases/:caseId/stage2',
  guardProcess(['Admin', 'Super Admin']),
  saveCaseStageTwo
);
router.post(
  '/process/cases/:caseId/send-email',
  guardProcess(['Admin', 'Super Admin']),
  sendCaseEmail
);
router.post(
  '/process/cases/:caseId/skip-email',
  guardProcess(['Admin', 'Super Admin']),
  skipCaseEmail
);
router.patch(
  '/process/cases/:caseId/committee-minutes',
  guardProcess(['Admin', 'Super Admin']),
  uploadCommitteeMinutes
);
router.patch(
  '/process/cases/:caseId/finalize',
  guardProcess(['Admin', 'Super Admin']),
  finalizeProcessCase
);

// Get DisCo actions by student
router.get(
  '/:studentId',
  guardStudent(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getDisCoActionsByStudent
);

export default router;
