/**
 * User Validation Schemas
 */

import Joi from 'joi';
import { objectId, email, password, phone, name } from './common.validation.js';

/**
 * User roles
 */
const userRoles = ['student', 'warden', 'associate_warden', 'admin', 'security', 'super_admin', 'disco'];

/**
 * Create user
 * POST /api/users
 */
export const createUserSchema = Joi.object({
  body: Joi.object({
    name: name.required(),
    email: email.required(),
    password: password,
    role: Joi.string().valid(...userRoles).required(),
    phone: phone,
    hostel: objectId,
    isActive: Joi.boolean().default(true),
  }),
});

/**
 * Update user
 * PUT /api/users/:id
 */
export const updateUserSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: name,
    email: email,
    phone: phone,
    hostel: objectId,
    isActive: Joi.boolean(),
  }),
});

/**
 * Get user by ID
 * GET /api/users/:id
 */
export const getUserByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Update user role
 * PATCH /api/users/:id/role
 */
export const updateUserRoleSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    role: Joi.string().valid(...userRoles).required(),
  }),
});

/**
 * Get users with filters
 * GET /api/users
 */
export const getUsersSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    role: Joi.string().valid(...userRoles),
    hostel: objectId,
    isActive: Joi.boolean(),
    search: Joi.string().max(200),
    sortBy: Joi.string().valid('name', 'email', 'createdAt', 'role'),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),
});

/**
 * Delete user
 * DELETE /api/users/:id
 */
export const deleteUserSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

export default {
  createUserSchema,
  updateUserSchema,
  getUserByIdSchema,
  updateUserRoleSchema,
  getUsersSchema,
  deleteUserSchema,
};
