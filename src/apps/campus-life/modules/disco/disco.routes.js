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
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const DISCO_STUDENT_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
};

const DISCO_PROCESS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.disciplinaryProcess',
  [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard',
};

const requireDiscoStudentRouteAccess = (req, res, next) => {
  const routeKey = DISCO_STUDENT_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

const requireDiscoProcessRouteAccess = (req, res, next) => {
  const routeKey = DISCO_PROCESS_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Admin-only DisCo management
router.post(
  '/add',
  authorizeRoles(['Admin']),
  requireDiscoStudentRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  addDisCoAction
);
router.put(
  '/update/:disCoId',
  authorizeRoles(['Admin']),
  requireDiscoStudentRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  updateDisCoAction
);
router.patch(
  '/update/:disCoId/reminders/:reminderItemId/done',
  authorizeRoles(['Admin']),
  requireDiscoStudentRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  markDisCoReminderDone
);
router.delete(
  '/:disCoId',
  authorizeRoles(['Admin']),
  requireDiscoStudentRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  deleteDisCoAction
);

// Admin disciplinary process workflows
router.post(
  '/process/cases',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  submitProcessCase
);
router.get(
  '/process/cases',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  getAdminProcessCases
);
router.get(
  '/process/cases/:caseId',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  getProcessCaseById
);
router.patch(
  '/process/cases/:caseId/stage2',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  saveCaseStageTwo
);
router.post(
  '/process/cases/:caseId/send-email',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  sendCaseEmail
);
router.patch(
  '/process/cases/:caseId/committee-minutes',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  uploadCommitteeMinutes
);
router.patch(
  '/process/cases/:caseId/finalize',
  authorizeRoles(['Admin', 'Super Admin']),
  requireDiscoProcessRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.manage']),
  finalizeProcessCase
);

// Get DisCo actions by student
router.get(
  '/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireDiscoStudentRouteAccess,
  requireAnyCapability(['cap.students.disciplinary.view', 'cap.students.detail.view', 'cap.students.view']),
  getDisCoActionsByStudent
);

export default router;
