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
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication and staff roles
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin', 'Warden', 'Associate Warden']));
const SHEET_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.sheet',
  'Super Admin': 'route.superAdmin.dashboard',
  Warden: 'route.warden.hostels',
  'Associate Warden': 'route.associateWarden.hostels',
};

const requireSheetRouteAccess = (req, res, next) => {
  const routeKey = SHEET_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Get hostel sheet data for spreadsheet view
router.get('/hostel/:hostelId', requireSheetRouteAccess, getHostelSheetData);

// Get allocation summary (degrees vs hostels matrix)
router.get('/summary', requireSheetRouteAccess, getAllocationSummary);

export default router;
