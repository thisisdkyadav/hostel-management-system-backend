/**
 * Upload Routes
 * Handles file uploads for various purposes
 * 
 * Base path: /api/upload
 */

import express from 'express';
import multer from 'multer';
import {
  uploadProfileImage,
  uploadStudentIdCard,
  h2FormPDF,
  uploadPaymentScreenshot,
  uploadLostAndFoundImage,
  uploadCertificate,
} from '../../controllers/uploadController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

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
