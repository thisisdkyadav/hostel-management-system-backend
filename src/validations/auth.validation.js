/**
 * Authentication Validation Schemas
 */

import Joi from 'joi';
import { email, password, objectId } from './common.validation.js';

/**
 * Login validation
 * POST /api/auth/login
 */
export const loginSchema = Joi.object({
  body: Joi.object({
    email: email.required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
    }),
  }),
});

/**
 * Google login validation
 * POST /api/auth/google
 */
export const googleLoginSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Google token is required',
    }),
  }),
});

/**
 * Update password validation
 * PUT /api/auth/password
 */
export const updatePasswordSchema = Joi.object({
  body: Joi.object({
    oldPassword: Joi.string().required().messages({
      'any.required': 'Old password is required',
    }),
    newPassword: password.required().messages({
      'any.required': 'New password is required',
      'string.min': 'New password must be at least 6 characters',
    }),
  }),
});

/**
 * Logout device validation
 * DELETE /api/auth/devices/:sessionId
 */
export const logoutDeviceSchema = Joi.object({
  params: Joi.object({
    sessionId: Joi.string().required().messages({
      'any.required': 'Session ID is required',
    }),
  }),
});

/**
 * Set password validation (for users without password)
 * POST /api/auth/set-password
 */
export const setPasswordSchema = Joi.object({
  body: Joi.object({
    password: password.required().messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
    }),
  }),
});

/**
 * Forgot password validation
 * POST /api/auth/forgot-password
 */
export const forgotPasswordSchema = Joi.object({
  body: Joi.object({
    email: email.required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required',
    }),
  }),
});

/**
 * Reset password validation
 * POST /api/auth/reset-password
 */
export const resetPasswordSchema = Joi.object({
  body: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required',
    }),
    password: password.required().messages({
      'any.required': 'Password is required',
      'string.min': 'Password must be at least 6 characters',
    }),
  }),
});

/**
 * Verify reset token validation
 * GET /api/auth/reset-password/:token
 */
export const verifyResetTokenSchema = Joi.object({
  params: Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Reset token is required',
    }),
  }),
});

export default {
  loginSchema,
  googleLoginSchema,
  updatePasswordSchema,
  logoutDeviceSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyResetTokenSchema,
};

