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
  uploadSignatureImage,
  uploadElectionNominationDocument,
  uploadOverallBestPerformerProofPDF,
  uploadPorDocumentPDF,
} from './upload.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const guardGymkhanaEvent = routeGuard(
  {
    [ROLES.GYMKHANA]: 'route.gymkhana.events',
    [ROLES.ADMIN]: 'route.admin.events',
  },
  { onUnmapped: 'allow' }
);

const guardOverallBestPerformer = routeGuard(
  {
    [ROLES.STUDENT]: 'route.student.overallBestPerformer',
    [ROLES.ADMIN]: 'route.admin.overallBestPerformer',
  },
  { onUnmapped: 'allow' }
);

const guardPor = routeGuard(
  {
    [ROLES.STUDENT]: 'route.student.por',
  },
  { onUnmapped: 'allow' }
);

const guardElection = routeGuard(
  {
    [ROLES.STUDENT]: 'route.student.elections',
    [ROLES.ADMIN]: 'route.admin.elections',
  },
  { onUnmapped: 'allow' }
);

// All routes require authentication
router.use(authenticate);

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const TEN_MB = 10 * 1024 * 1024;
const electionNominationUpload = multer({
  storage,
  limits: { fileSize: TEN_MB },
});
const disCoProcessUpload = multer({
  storage,
  limits: { fileSize: TEN_MB },
});

const handleElectionNominationUpload = (req, res, next) => {
  electionNominationUpload.any()(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Document size must be 10MB or smaller' });
    }

    if (error) {
      return next(error);
    }

    return next();
  });
};

const handleDisCoProcessUpload = (req, res, next) => {
  disCoProcessUpload.any()(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Document size must be 10MB or smaller' });
    }

    if (error) {
      return next(error);
    }

    return next();
  });
};

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
  guardGymkhanaEvent(['Gymkhana']),
  upload.any(),
  uploadEventProposalPDF
);

// Event chief guest PDF upload
router.post(
  '/event-chief-guest-pdf',
  guardGymkhanaEvent(['Gymkhana']),
  upload.any(),
  uploadEventChiefGuestPDF
);

// Event bill PDF upload
router.post(
  '/event-bill-pdf',
  guardGymkhanaEvent(['Gymkhana']),
  upload.any(),
  uploadEventBillPDF
);

// Event report PDF upload
router.post(
  '/event-report-pdf',
  guardGymkhanaEvent(['Gymkhana']),
  upload.any(),
  uploadEventReportPDF
);

// Disciplinary process document PDF upload
router.post(
  '/disco-process-pdf',
  authorizeRoles(['Admin', 'Super Admin']),
  handleDisCoProcessUpload,
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

// Signature image upload (any authenticated user, for their own profile signature)
router.post('/signature-image', upload.single('image'), uploadSignatureImage);

// Election nomination document upload
router.post(
  '/election-nomination-document',
  guardElection(['Student', 'Admin', 'Super Admin']),
  handleElectionNominationUpload,
  uploadElectionNominationDocument
);

// Overall Best Performer proof PDF upload
router.post(
  '/overall-best-performer-proof-pdf',
  guardOverallBestPerformer(['Student', 'Admin', 'Super Admin']),
  upload.any(),
  uploadOverallBestPerformerProofPDF
);

// POR supporting document PDF upload
router.post(
  '/por-document-pdf',
  guardPor(['Student']),
  handleElectionNominationUpload,
  uploadPorDocumentPDF
);

export default router;
