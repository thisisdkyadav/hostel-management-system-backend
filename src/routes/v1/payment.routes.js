/**
 * Payment Routes
 * Handles payment link creation and status checking
 * 
 * Base path: /api/payment
 */

import express from 'express';
import {
  createPaymentLink,
  checkPaymentStatus,
} from '../../../controllers/paymentController.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';
import { requirePermission } from '../../../utils/permissions.js';

const router = express.Router();

// Note: Authentication is not applied at router level for these routes
// Based on original implementation

// Create payment link (Admin only)
router.post('/create-link', authorizeRoles(['Admin']), createPaymentLink);

// Check payment status
router.get(
  '/status/:paymentLinkId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor', 'Student']),
  requirePermission('visitors', 'view'),
  checkPaymentStatus
);

export default router;
