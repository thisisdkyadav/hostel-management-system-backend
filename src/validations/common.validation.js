/**
 * Common Validation Schemas
 * Reusable validation components
 */

import Joi from 'joi';

// ============================================
// Custom Validators
// ============================================

/**
 * MongoDB ObjectId validation
 */
export const objectId = Joi.string()
  .regex(/^[0-9a-fA-F]{24}$/)
  .message('Invalid ID format');

/**
 * Email validation
 */
export const email = Joi.string()
  .email({ tlds: { allow: false } })
  .lowercase()
  .trim();

/**
 * Password validation (min 6 chars)
 */
export const password = Joi.string()
  .min(6)
  .max(128)
  .message('Password must be at least 6 characters');

/**
 * Phone number validation
 */
export const phone = Joi.string()
  .pattern(/^[0-9]{10}$/)
  .message('Phone number must be 10 digits');

/**
 * Name validation
 */
export const name = Joi.string()
  .min(2)
  .max(100)
  .trim();

// ============================================
// Common Schema Parts
// ============================================

/**
 * ID parameter schema
 * Use for routes like /api/resource/:id
 */
export const idParamSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Pagination query schema
 */
export const paginationSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().max(50),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

/**
 * Search query schema
 */
export const searchSchema = Joi.object({
  query: Joi.object({
    search: Joi.string().max(200).trim(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
});

/**
 * Date range query schema
 */
export const dateRangeSchema = Joi.object({
  query: Joi.object({
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')),
  }),
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create a schema that requires ID param and optional body
 */
export const withIdParam = (bodySchema = Joi.object()) => {
  return Joi.object({
    params: Joi.object({
      id: objectId.required(),
    }),
    body: bodySchema,
  });
};

/**
 * Create a schema that requires ID param and query
 */
export const withIdParamAndQuery = (querySchema = Joi.object()) => {
  return Joi.object({
    params: Joi.object({
      id: objectId.required(),
    }),
    query: querySchema,
  });
};

/**
 * Create a schema with pagination
 */
export const withPagination = (additionalQuery = {}) => {
  return Joi.object({
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(10),
      sortBy: Joi.string().max(50),
      sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
      ...additionalQuery,
    }),
  });
};

export default {
  objectId,
  email,
  password,
  phone,
  name,
  idParamSchema,
  paginationSchema,
  searchSchema,
  dateRangeSchema,
  withIdParam,
  withIdParamAndQuery,
  withPagination,
};
