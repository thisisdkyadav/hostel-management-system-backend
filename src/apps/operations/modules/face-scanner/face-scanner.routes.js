/**
 * Face Scanner Routes
 * Handles face scanner management and scan processing
 * 
 * Base path: /api/v1/face-scanner
 */

import express from 'express';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { authenticateScanner } from '../../../../middlewares/faceScannerAuth.middleware.js';
import {
  createFaceScanner,
  getAllFaceScanners,
  getFaceScannerById,
  updateFaceScanner,
  deleteFaceScanner,
  regeneratePassword,
  testScannerAuth,
  getScannerAccounts,
  getScannerAccountById,
  createScannerAccount,
  updateScannerAccount,
  deleteScannerAccount,
  regenerateScannerAccountPassword,
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
const guard = routeGuard({
  Admin: 'route.admin.faceScanners',
  'Super Admin': 'route.superAdmin.dashboard',
});

router.use(guard.access);

// Accounts must precede /:id; they share the existing session + role + route guard.
router.get('/accounts', getScannerAccounts);
router.get('/accounts/:id', getScannerAccountById);
router.post('/accounts', createScannerAccount);
router.put('/accounts/:id', updateScannerAccount);
router.delete('/accounts/:id', deleteScannerAccount);
router.post('/accounts/:id/regenerate-password', regenerateScannerAccountPassword);

// CRUD operations for face scanners
router.post('/', createFaceScanner);
router.get('/', getAllFaceScanners);
router.get('/:id', getFaceScannerById);
router.put('/:id', updateFaceScanner);
router.delete('/:id', deleteFaceScanner);
router.post('/:id/regenerate-password', regeneratePassword);

export default router;
