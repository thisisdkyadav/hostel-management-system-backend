/**
 * Super Admin Routes
 * Handles super admin operations - admins, API clients, dashboard stats
 * 
 * Base path: /api/super-admin
 */

import express from 'express';
import {
  getApiClients,
  deleteApiClient,
  createApiClient,
  createAdmin,
  getAdmins,
  updateAdmin,
  deleteAdmin,
  updateApiClient,
  getDashboardStats,
} from '../../../controllers/superAdminControllers.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication and Super Admin/Admin role
router.use(authenticate);
router.use(authorizeRoles(['Super Admin', 'Admin']));

// Dashboard
router.get('/dashboard', getDashboardStats);

// Admin management
router.get('/admins', getAdmins);
router.post('/admins', createAdmin);
router.put('/admins/:adminId', updateAdmin);
router.delete('/admins/:adminId', deleteAdmin);

// API client management
router.get('/api-clients', getApiClients);
router.post('/api-clients', createApiClient);
router.put('/api-clients/:clientId', updateApiClient);
router.delete('/api-clients/:clientId', deleteApiClient);

export default router;
