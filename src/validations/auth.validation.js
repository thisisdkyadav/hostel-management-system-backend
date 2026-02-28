/**
 * Authentication Validation Schemas
 */

import Joi from 'joi';
import { email, password } from './common.validation.js';

/**
 * Login validation
 * POST /api/auth/login
 */
export const loginSchema = Joi.object({
  email: email.required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string().required().messages({
    'any.required': 'Password is required',
  }),
});

/**
 * Google login validation
 * POST /api/auth/google
 */
export const googleLoginSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    'any.required': 'Google token is required',
  }),
});

/**
 * Verify SSO token validation
 * POST /api/auth/verify-sso-token
 */
export const verifySSOTokenSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    'any.required': 'Token is required',
  }),
});

/**
 * Update password validation
 * POST /api/auth/update-password
 */
export const updatePasswordSchema = Joi.object({
  oldPassword: Joi.string().required().messages({
    'any.required': 'Old password is required',
  }),
  newPassword: password.required().messages({
    'any.required': 'New password is required',
    'string.min': 'New password must be at least 6 characters',
  }),
});

/**
 * Update pinned tabs validation
 * PATCH /api/auth/user/pinned-tabs
 */
export const updatePinnedTabsSchema = Joi.object({
  pinnedTabs: Joi.array().items(Joi.string().trim().allow('')).required().messages({
    'array.base': 'pinnedTabs must be an array',
    'any.required': 'pinnedTabs is required',
  }),
});

/**
 * Logout device validation
 * POST /api/auth/user/devices/logout/:sessionId
 */
export const logoutDeviceSchema = Joi.object({
  sessionId: Joi.string().trim().required().messages({
    'any.required': 'Session ID is required',
  }),
});

/**
 * Forgot password validation
 * POST /api/auth/forgot-password
 */
export const forgotPasswordSchema = Joi.object({
  email: email.required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
});

/**
 * Reset password validation
 * POST /api/auth/reset-password
 */
export const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    'any.required': 'Reset token is required',
  }),
  password: password.required().messages({
    'any.required': 'Password is required',
    'string.min': 'Password must be at least 6 characters',
  }),
});

/**
 * Verify reset token validation
 * GET /api/auth/reset-password/:token
 */
export const verifyResetTokenSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    'any.required': 'Reset token is required',
  }),
});

export default {
  loginSchema,
  googleLoginSchema,
  verifySSOTokenSchema,
  updatePasswordSchema,
  updatePinnedTabsSchema,
  logoutDeviceSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetTokenSchema,
};
