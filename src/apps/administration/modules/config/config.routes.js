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
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

const CONFIG_VIEW_CAPABILITY_BY_KEY = {
  studentEditableFields: 'cap.settings.studentFields.view',
  degrees: 'cap.settings.degrees.view',
  departments: 'cap.settings.departments.view',
  registeredStudents: 'cap.settings.registeredStudents.view',
  academicHolidays: 'cap.settings.academicHolidays.view',
  systemSettings: 'cap.settings.system.view',
};

const CONFIG_UPDATE_CAPABILITY_BY_KEY = {
  studentEditableFields: 'cap.settings.studentFields.update',
  degrees: 'cap.settings.degrees.update',
  departments: 'cap.settings.departments.update',
  registeredStudents: 'cap.settings.registeredStudents.update',
  academicHolidays: 'cap.settings.academicHolidays.update',
  systemSettings: 'cap.settings.system.update',
};

const requireConfigCapability = (mode) => {
  return (req, res, next) => {
    const key = req.params.key;
    const specificCapability = mode === 'view'
      ? CONFIG_VIEW_CAPABILITY_BY_KEY[key]
      : CONFIG_UPDATE_CAPABILITY_BY_KEY[key];

    const capabilities = [];

    if (specificCapability) {
      capabilities.push(specificCapability);
    }

    capabilities.push(mode === 'view' ? 'cap.settings.view' : 'cap.settings.update');

    return requireAnyCapability(capabilities)(req, res, next);
  };
};

const requireSettingsRouteAccess = requireRouteAccess('route.admin.settings');

// All routes require authentication and Admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Get configuration by key
router.get('/:key', requireSettingsRouteAccess, requireConfigCapability('view'), getConfigurationByKey);

// Update configuration
router.put('/:key', requireSettingsRouteAccess, requireConfigCapability('update'), updateConfiguration);

// Reset configuration to default
router.post('/:key/reset', requireSettingsRouteAccess, requireConfigCapability('update'), resetConfigurationToDefault);

export default router;
