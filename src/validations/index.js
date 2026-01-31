/**
 * Validation Layer - Central Export
 * 
 * This module provides a comprehensive validation layer using Joi.
 * Import validators from this file to use in route handlers.
 * 
 * @example
 * import { validate, authValidation } from '../validations/index.js';
 * router.post('/login', validate(authValidation.loginSchema), authController.login);
 */

// Validation middleware
export { validate, validateAsync } from './validate.middleware.js';

// Common schemas (for building custom validators)
export * as commonSchemas from './common.validation.js';

// Auth validation
export * as authValidation from './auth.validation.js';

// Student validation
export * as studentValidation from './student.validation.js';

// User validation
export * as userValidation from './user.validation.js';

// Complaint validation
export * as complaintValidation from './complaint.validation.js';

// Visitor validation
export * as visitorValidation from './visitor.validation.js';

// Leave validation
export * as leaveValidation from './leave.validation.js';

// Hostel validation
export * as hostelValidation from './hostel.validation.js';

// Event validation
export * as eventValidation from './event.validation.js';

// Notification validation
export * as notificationValidation from './notification.validation.js';

/**
 * Re-export individual schemas for convenience
 * This allows both import patterns:
 * 
 * Pattern 1: Import namespace
 * import { authValidation } from '../validations/index.js';
 * validate(authValidation.loginSchema)
 * 
 * Pattern 2: Direct import
 * import { loginSchema } from '../validations/auth.validation.js';
 * validate(loginSchema)
 */
