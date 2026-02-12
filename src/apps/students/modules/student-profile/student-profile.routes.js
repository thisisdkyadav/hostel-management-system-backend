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

const router = express.Router();

// All routes require authentication and Student role
router.use(authenticate);
router.use(authorizeRoles(['Student']));

// Student profile routes
router.get('/', getStudentProfile);
router.get('/editable', getEditableProfile);
router.put('/', updateStudentProfile);

// Family members management
router.get('/family-members', getFamilyMembers);
router.post('/family-members', addFamilyMember);
router.put('/family-members/:id', updateFamilyMember);
router.delete('/family-members/:id', deleteFamilyMember);

// Health information
router.get('/health', getHealth);

export default router;
