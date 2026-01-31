/**
 * Family Member Routes
 * Handles student family member management
 * 
 * Base path: /api/family
 */

import express from 'express';
import {
  createFamilyMember,
  getFamilyMembers,
  updateFamilyMember,
  deleteFamilyMember,
  updateBulkFamilyMembers,
} from '../controllers/familyMemberController.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication and staff roles
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']));

// Bulk update family members
router.post('/bulk-update', requirePermission('students_info', 'edit'), updateBulkFamilyMembers);

// Individual family member operations
router.post('/:userId', requirePermission('students_info', 'edit'), createFamilyMember);
router.get('/:userId', requirePermission('students_info', 'view'), getFamilyMembers);
router.put('/:id', requirePermission('students_info', 'edit'), updateFamilyMember);
router.delete('/:id', requirePermission('students_info', 'edit'), deleteFamilyMember);

export default router;
