/**
 * Certificate Routes
 * Handles student certificate management
 * 
 * Base path: /api/certificate
 */

import express from 'express';
import {
  addCertificate,
  getCertificatesByStudent,
  updateCertificate,
  deleteCertificate,
} from '../../../controllers/certificateController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Admin-only certificate management
router.post('/add', authorizeRoles(['Admin']), addCertificate);
router.put('/update/:certificateId', authorizeRoles(['Admin']), updateCertificate);
router.delete('/:certificateId', authorizeRoles(['Admin']), deleteCertificate);

// Get certificates by student
router.get(
  '/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requirePermission('students_info', 'view'),
  getCertificatesByStudent
);

export default router;
