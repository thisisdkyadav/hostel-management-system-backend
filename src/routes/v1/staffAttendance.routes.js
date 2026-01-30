/**
 * Staff Attendance Routes
 * Handles staff attendance tracking via QR codes
 * 
 * Base path: /api/staff
 */

import express from 'express';
import {
  verifyQR,
  recordAttendance,
  getAttendanceRecords,
} from '../../controllers/staffAttendanceController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// QR verification and attendance recording (Hostel Gate only)
router.post('/verify-qr', authorizeRoles(['Hostel Gate']), verifyQR);
router.post('/attendance/record', authorizeRoles(['Hostel Gate']), recordAttendance);

// Get attendance records
router.get(
  '/attendance/records',
  authorizeRoles([
    'Admin',
    'Warden',
    'Associate Warden',
    'Hostel Supervisor',
    'Security',
    'Hostel Gate',
  ]),
  getAttendanceRecords
);

export default router;
