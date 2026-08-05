/**
 * Sheet Routes
 * Handles spreadsheet data views for hostel management
 * 
 * Base path: /api/v1/sheet
 */

import express from 'express';
import {
  getHostelSheetData,
  getAllocationSummary,
} from './sheet.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication and staff roles
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden']));
const guard = routeGuard({
  Admin: 'route.admin.sheet',
  'Super Admin': 'route.superAdmin.dashboard',
  Warden: 'route.warden.hostels',
  'Associate Warden': 'route.associateWarden.hostels',
});

// Get hostel sheet data for spreadsheet view
router.get('/hostel/:hostelId', guard.access, getHostelSheetData);

// Get allocation summary (degrees vs hostels matrix)
router.get('/summary', guard.access, getAllocationSummary);

export default router;
