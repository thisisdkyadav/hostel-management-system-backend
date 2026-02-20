/**
 * Upload Routes
 * Handles file uploads for various purposes
 * 
 * Base path: /api/v1/upload
 */

import express from 'express';
import multer from 'multer';
import {
  uploadProfileImage,
  uploadStudentIdCard,
  h2FormPDF,
  uploadEventProposalPDF,
  uploadEventChiefGuestPDF,
  uploadEventBillPDF,
  uploadEventReportPDF,
  uploadDisCoProcessPDF,
  uploadPaymentScreenshot,
  uploadLostAndFoundImage,
  uploadCertificate,
} from './upload.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const GYMKHANA_EVENT_UPLOAD_ROUTE_KEYS_BY_ROLE = {
  [ROLES.GYMKHANA]: 'route.gymkhana.events',
  [ROLES.ADMIN]: 'route.admin.events',
};

const requireGymkhanaEventUploadRouteAccess = (req, res, next) => {
  const routeKey = GYMKHANA_EVENT_UPLOAD_ROUTE_KEYS_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return next();
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// All routes require authentication
router.use(authenticate);

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Profile image upload
router.post(
  '/profile/:userId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  upload.single('image'),
  uploadProfileImage
);

// Student ID card upload
router.post(
  '/student-id/:side',
  authorizeRoles(['Student']),
  upload.single('image'),
  uploadStudentIdCard
);

// H2 form PDF upload
router.post('/h2-form', authorizeRoles(['Student']), upload.any(), h2FormPDF);

// Event proposal PDF upload
router.post(
  '/event-proposal-pdf',
  authorizeRoles(['Gymkhana']),
  requireGymkhanaEventUploadRouteAccess,
  requireAnyCapability(['cap.events.create']),
  upload.any(),
  uploadEventProposalPDF
);

// Event chief guest PDF upload
router.post(
  '/event-chief-guest-pdf',
  authorizeRoles(['Gymkhana']),
  requireGymkhanaEventUploadRouteAccess,
  requireAnyCapability(['cap.events.create']),
  upload.any(),
  uploadEventChiefGuestPDF
);

// Event bill PDF upload
router.post(
  '/event-bill-pdf',
  authorizeRoles(['Gymkhana']),
  requireGymkhanaEventUploadRouteAccess,
  requireAnyCapability(['cap.events.create']),
  upload.any(),
  uploadEventBillPDF
);

// Event report PDF upload
router.post(
  '/event-report-pdf',
  authorizeRoles(['Gymkhana']),
  requireGymkhanaEventUploadRouteAccess,
  requireAnyCapability(['cap.events.create']),
  upload.any(),
  uploadEventReportPDF
);

// Disciplinary process document PDF upload
router.post(
  '/disco-process-pdf',
  authorizeRoles(['Admin', 'Super Admin']),
  upload.any(),
  uploadDisCoProcessPDF
);

// Payment screenshot upload
router.post(
  '/payment-screenshot',
  authorizeRoles(['Student']),
  upload.single('image'),
  uploadPaymentScreenshot
);

// Lost and found image upload
router.post(
  '/lost-and-found-image',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  upload.single('image'),
  uploadLostAndFoundImage
);

// Certificate upload
router.post('/certificate', authorizeRoles(['Admin']), upload.any(), uploadCertificate);

export default router;
