/**
 * Student Profile Routes
 * Handles student self-service profile operations
 * 
 * Base path: /api/student-profile
 */

import express from 'express';
import {
  updateStudentProfile,
  getStudentProfile,
  getEditableProfile,
  getFamilyMembers,
  addFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
  getHealth,
} from './student-profile.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication and Student role
router.use(authenticate);
router.use(authorizeRoles(['Student']));
router.use(requireRouteAccess('route.student.profile'));

// Student profile routes
router.get('/', requireAnyCapability(['cap.profile.self.view']), getStudentProfile);
router.get('/editable', requireAnyCapability(['cap.profile.self.view']), getEditableProfile);
router.put('/', requireAnyCapability(['cap.profile.self.update']), updateStudentProfile);

// Family members management
router.get('/family-members', requireAnyCapability(['cap.profile.self.view']), getFamilyMembers);
router.post('/family-members', requireAnyCapability(['cap.profile.self.update']), addFamilyMember);
router.put('/family-members/:id', requireAnyCapability(['cap.profile.self.update']), updateFamilyMember);
router.delete('/family-members/:id', requireAnyCapability(['cap.profile.self.update']), deleteFamilyMember);

// Health information
router.get('/health', requireAnyCapability(['cap.profile.self.view']), getHealth);

export default router;
