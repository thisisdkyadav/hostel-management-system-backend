/**
 * Super Admin Routes
 * Handles super admin operations - admins, API clients, dashboard stats
 *
 * Base path: /api/v1/super-admin
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
} from './super-admin.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

// One guard per route area (flattens the former role x area map). Access-only:
// the Super Admin/Admin role gate is applied once via router.use below.
const guardDashboard = routeGuard(
  { [ROLES.SUPER_ADMIN]: 'route.superAdmin.dashboard', [ROLES.ADMIN]: 'route.admin.dashboard' },
  { onUnmapped: 'allow' }
);
const guardAdmins = routeGuard(
  { [ROLES.SUPER_ADMIN]: 'route.superAdmin.admins', [ROLES.ADMIN]: 'route.admin.administrators' },
  { onUnmapped: 'allow' }
);
const guardApiKeys = routeGuard(
  { [ROLES.SUPER_ADMIN]: 'route.superAdmin.apiKeys', [ROLES.ADMIN]: 'route.admin.settings' },
  { onUnmapped: 'allow' }
);

// All routes require authentication and Super Admin/Admin role
router.use(authenticate);
router.use(authorizeRoles(['Super Admin', 'Admin']));

// Profile
router.get(
  '/profile',
  requireRouteAccess('route.superAdmin.profile'),
  (req, res) => {
    res.json({
      success: true,
      data: {
        profile: req.user,
      },
    });
  }
);

// Dashboard
router.get('/dashboard', guardDashboard.access, getDashboardStats);

// Admin management
router.get('/admins', guardAdmins.access, getAdmins);
router.post('/admins', guardAdmins.access, createAdmin);
router.put('/admins/:adminId', guardAdmins.access, updateAdmin);
router.delete('/admins/:adminId', guardAdmins.access, deleteAdmin);

// API client management
router.get('/api-clients', guardApiKeys.access, getApiClients);
router.post('/api-clients', guardApiKeys.access, createApiClient);
router.put('/api-clients/:clientId', guardApiKeys.access, updateApiClient);
router.delete('/api-clients/:clientId', guardApiKeys.access, deleteApiClient);

export default router;
