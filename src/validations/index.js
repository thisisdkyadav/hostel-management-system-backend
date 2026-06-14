/**
 * Validation Layer - Central Export
 * 
 * This module provides a comprehensive validation layer using Joi.
 * Import validators from this file to use in route handlers.
 * 
 * @example
 * import { validate, studentValidation } from '../validations/index.js';
 * router.post('/', validate(studentValidation.createSchema), studentController.create);
 */

// Validation middleware
export { validate } from '../middlewares/validate.middleware.js';

// Common schemas (for building custom validators)
export * as commonSchemas from './common.validation.js';

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
 * import { studentValidation } from '../validations/index.js';
 * validate(studentValidation.createSchema)
 *
 * Pattern 2: Direct import
 * import { createSchema } from '../validations/student.validation.js';
 * validate(createSchema)
 */
