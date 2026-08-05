/**
 * Certificate Routes
 * Handles student certificate management
 * 
 * Base path: /api/v1/certificate
 */

import express from 'express';
import {
  addCertificate,
  getCertificatesByStudent,
  updateCertificate,
  deleteCertificate,
} from './certificates.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guard = routeGuard({
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
});

// All routes require authentication
router.use(authenticate);

// Admin-only certificate management
router.post(
  '/add',
  guard(['Admin']),
  addCertificate
);
router.put(
  '/update/:certificateId',
  guard(['Admin']),
  updateCertificate
);
router.delete(
  '/:certificateId',
  guard(['Admin']),
  deleteCertificate
);

// Get certificates by student
router.get(
  '/:studentId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getCertificatesByStudent
);

export default router;
