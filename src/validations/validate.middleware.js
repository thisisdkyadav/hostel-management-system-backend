/**
 * Validation Middleware
 * Uses Joi to validate request body, params, and query
 */

import { ValidationError } from '../core/errors/index.js';

/**
 * Creates validation middleware for a Joi schema
 * @param {Object} schema - Joi schema object with body, params, query keys
 * @returns {Function} Express middleware
 * 
 * @example
 * // In route file:
 * import { validate } from '../validations/validate.middleware.js';
 * import { createStudentSchema } from '../validations/student.validation.js';
 * 
 * router.post('/', validate(createStudentSchema), studentController.create);
 */
export const validate = (schema) => {
  return (req, res, next) => {
    // Build object with body, params, query to validate against schema
    const dataToValidate = {
      body: req.body,
      params: req.params,
      query: req.query,
    };

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,      // Return all errors, not just first
      stripUnknown: true,     // Remove unknown fields
      allowUnknown: false,    // Don't allow unknown fields
    });

    if (error) {
      const details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/"/g, ''),
      }));
      
      throw new ValidationError('Validation failed', details);
    }

    // Replace request data with validated (and sanitized) values
    if (value.body) req.body = value.body;
    if (value.params) req.params = value.params;
    if (value.query) req.query = value.query;

    next();
  };
};

/**
 * Async version of validate middleware
 * Use when schema uses async validation
 */
export const validateAsync = (schema) => {
  return async (req, res, next) => {
    try {
      // Build object with body, params, query to validate against schema
      const dataToValidate = {
        body: req.body,
        params: req.params,
        query: req.query,
      };

      const value = await schema.validateAsync(dataToValidate, {
        abortEarly: false,
        stripUnknown: true,
        allowUnknown: false,
      });

      if (value.body) req.body = value.body;
      if (value.params) req.params = value.params;
      if (value.query) req.query = value.query;

      next();
    } catch (error) {
      if (error.isJoi) {
        const details = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message.replace(/"/g, ''),
        }));
        return next(new ValidationError('Validation failed', details));
      }
      next(error);
    }
  };
};

export default validate;
