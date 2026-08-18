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
import { SUBROLES } from '../../../../core/constants/roles.constants.js';

const router = express.Router();

const requireSettingsRouteAccess = requireRouteAccess('route.admin.settings');

/** Visitor accommodation config — Chief Warden Office + Accountant only. */
const ACCOMMODATION_SETTINGS_SUBROLES = [
  SUBROLES.CHIEF_WARDEN_OFFICE,
  SUBROLES.ACCOUNTANT,
];

const requireAccommodationSettingsAccess = (req, res, next) => {
  if (req.params.key !== 'accommodation') return next();
  if (!ACCOMMODATION_SETTINGS_SUBROLES.includes(req?.user?.subRole)) {
    return res.status(403).json({
      success: false,
      message: 'Only Chief Warden Office and Accountant can access accommodation settings',
    });
  }
  return next();
};

// All routes require authentication and Admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Get configuration by key
router.get('/:key', requireSettingsRouteAccess, requireAccommodationSettingsAccess, getConfigurationByKey);

// Update configuration
router.put('/:key', requireSettingsRouteAccess, requireAccommodationSettingsAccess, updateConfiguration);

// Reset configuration to default
router.post('/:key/reset', requireSettingsRouteAccess, requireAccommodationSettingsAccess, resetConfigurationToDefault);

export default router;
