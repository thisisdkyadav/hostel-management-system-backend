/**
 * Configuration Routes
 * Handles system configuration management
 * 
 * Base path: /api/config
 */

import express from 'express';
import {
  getConfigurationByKey,
  updateConfiguration,
  resetConfigurationToDefault,
} from '../../../controllers/configController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication and Admin role
router.use(authenticate);
router.use(authorizeRoles(['Admin']));

// Get configuration by key
router.get('/:key', getConfigurationByKey);

// Update configuration
router.put('/:key', updateConfiguration);

// Reset configuration to default
router.post('/:key/reset', resetConfigurationToDefault);

export default router;
