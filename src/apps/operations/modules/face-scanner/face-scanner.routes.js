/**
 * Face Scanner Routes
 * Handles face scanner management and scan processing
 * 
 * Base path: /api/v1/face-scanner
 */

import express from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { authenticateScanner } from '../../../../middlewares/faceScannerAuth.middleware.js';
import {
  createFaceScanner,
  getAllFaceScanners,
  getFaceScannerById,
  updateFaceScanner,
  deleteFaceScanner,
  regeneratePassword,
  testScannerAuth,
} from './face-scanner.controller.js';
import { processScan, ping } from './scanner-action.controller.js';

const router = express.Router();

// =============================================
// Scanner Action Routes (use scanner auth)
// Automated - no manual verification needed
// =============================================
router.get('/ping', authenticateScanner, ping);
router.post('/scan', authenticateScanner, processScan);

// Test scanner authentication (for debugging)
router.get('/test-auth', authenticateScanner, testScannerAuth);

// =============================================
// Admin Management Routes (use session auth)
// These are called by the web dashboard
// =============================================
router.use(authenticate);
router.use(authorizeRoles(['Admin', 'Super Admin']));
const FACE_SCANNER_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.faceScanners',
  'Super Admin': 'route.superAdmin.dashboard',
};

const requireFaceScannerRouteAccess = (req, res, next) => {
  const routeKey = FACE_SCANNER_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

router.use(requireFaceScannerRouteAccess);
router.use(requireAnyCapability(['cap.faceScanners.manage']));

// CRUD operations for face scanners
router.post('/', createFaceScanner);
router.get('/', getAllFaceScanners);
router.get('/:id', getFaceScannerById);
router.put('/:id', updateFaceScanner);
router.delete('/:id', deleteFaceScanner);
router.post('/:id/regenerate-password', regeneratePassword);

export default router;
