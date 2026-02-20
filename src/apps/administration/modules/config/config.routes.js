/**
 * Configuration Routes
 * Handles system configuration management
 * 
 * Base path: /api/v1/config
 */

import express from 'express';
import {
  getConfigurationByKey,
  updateConfiguration,
  resetConfigurationToDefault,
} from './config.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

const requireSettingsRouteAccess = requireRouteAccess('route.admin.settings');

// All routes require authentication and Admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Get configuration by key
router.get('/:key', requireSettingsRouteAccess, getConfigurationByKey);

// Update configuration
router.put('/:key', requireSettingsRouteAccess, updateConfiguration);

// Reset configuration to default
router.post('/:key/reset', requireSettingsRouteAccess, resetConfigurationToDefault);

export default router;
