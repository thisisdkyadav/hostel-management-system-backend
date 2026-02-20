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
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const CERTIFICATES_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: 'route.admin.students',
  [ROLES.WARDEN]: 'route.warden.students',
  [ROLES.ASSOCIATE_WARDEN]: 'route.associateWarden.students',
  [ROLES.HOSTEL_SUPERVISOR]: 'route.hostelSupervisor.students',
};

const requireCertificatesRouteAccess = (req, res, next) => {
  const routeKey = CERTIFICATES_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Admin-only certificate management
router.post(
  '/add',
  authorizeRoles(['Admin']),
  requireCertificatesRouteAccess,
  addCertificate
);
router.put(
  '/update/:certificateId',
  authorizeRoles(['Admin']),
  requireCertificatesRouteAccess,
  updateCertificate
);
router.delete(
  '/:certificateId',
  authorizeRoles(['Admin']),
  requireCertificatesRouteAccess,
  deleteCertificate
);

// Get certificates by student
router.get(
  '/:studentId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireCertificatesRouteAccess,
  getCertificatesByStudent
);

export default router;
