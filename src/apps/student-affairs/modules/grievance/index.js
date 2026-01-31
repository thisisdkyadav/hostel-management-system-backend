/**
 * @fileoverview Grievance Module Exports
 * @description Central export point for grievance module
 * @module apps/student-affairs/modules/grievance
 */

// Routes
export { default as grievanceRoutes } from './grievance.routes.js';

// Controller
export * from './grievance.controller.js';

// Service
export { grievanceService } from './grievance.service.js';

// Validation
export * from './grievance.validation.js';

// Constants
export * from './grievance.constants.js';
