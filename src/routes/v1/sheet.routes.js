/**
 * Sheet Routes
 * Handles spreadsheet data views for hostel management
 * 
 * Base path: /api/sheet
 */

import express from 'express';
import {
  getHostelSheetData,
  getAllocationSummary,
} from '../../controllers/sheetController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication and staff roles
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden']));

// Get hostel sheet data for spreadsheet view
router.get('/hostel/:hostelId', getHostelSheetData);

// Get allocation summary (degrees vs hostels matrix)
router.get('/summary', getAllocationSummary);

export default router;
