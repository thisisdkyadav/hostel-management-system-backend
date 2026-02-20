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
import { ROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const SUPER_ADMIN_ROUTE_KEYS_BY_ROLE = {
  [ROLES.SUPER_ADMIN]: {
    dashboard: 'route.superAdmin.dashboard',
    admins: 'route.superAdmin.admins',
    apiKeys: 'route.superAdmin.apiKeys',
  },
  [ROLES.ADMIN]: {
    dashboard: 'route.admin.dashboard',
    admins: 'route.admin.administrators',
    apiKeys: 'route.admin.settings',
  },
};

const requireRoleMappedRouteAccess = (routeArea) => (req, res, next) => {
  const role = req?.user?.role;
  const routeKey = SUPER_ADMIN_ROUTE_KEYS_BY_ROLE[role]?.[routeArea];
  if (!routeKey) {
    return next();
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

const requireSuperAdminDashboardRouteAccess = requireRoleMappedRouteAccess('dashboard');
const requireSuperAdminAdminsRouteAccess = requireRoleMappedRouteAccess('admins');
const requireSuperAdminApiKeysRouteAccess = requireRoleMappedRouteAccess('apiKeys');

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
router.get(
  '/dashboard',
  requireSuperAdminDashboardRouteAccess,
  getDashboardStats
);

// Admin management
router.get('/admins', requireSuperAdminAdminsRouteAccess, getAdmins);
router.post('/admins', requireSuperAdminAdminsRouteAccess, createAdmin);
router.put('/admins/:adminId', requireSuperAdminAdminsRouteAccess, updateAdmin);
router.delete('/admins/:adminId', requireSuperAdminAdminsRouteAccess, deleteAdmin);

// API client management
router.get('/api-clients', requireSuperAdminApiKeysRouteAccess, getApiClients);
router.post('/api-clients', requireSuperAdminApiKeysRouteAccess, createApiClient);
router.put('/api-clients/:clientId', requireSuperAdminApiKeysRouteAccess, updateApiClient);
router.delete('/api-clients/:clientId', requireSuperAdminApiKeysRouteAccess, deleteApiClient);

export default router;
