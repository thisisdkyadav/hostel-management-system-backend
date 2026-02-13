/**
 * Email Validation Schemas
 * Validation for custom email sending endpoints
 */

import Joi from 'joi';
import { email } from './common.validation.js';

/**
 * Send email validation
 * POST /api/email/send
 */
export const sendEmailSchema = Joi.object({
  body: Joi.object({
    to: Joi.alternatives()
      .try(
        email,
        Joi.array().items(email).min(1).max(100)
      )
      .required()
      .messages({
        'any.required': 'Recipient email(s) required',
        'array.min': 'At least one recipient email is required',
        'array.max': 'Maximum 100 recipients allowed per request',
      }),
    subject: Joi.string()
      .min(1)
      .max(200)
      .required()
      .messages({
        'any.required': 'Email subject is required',
        'string.max': 'Subject must be at most 200 characters',
      }),
    body: Joi.string()
      .min(1)
      .max(50000)
      .required()
      .messages({
        'any.required': 'Email body is required',
        'string.max': 'Email body must be at most 50000 characters',
      }),
    sendType: Joi.string()
      .valid('individual', 'group')
      .default('individual')
      .messages({
        'any.only': 'Send type must be either "individual" or "group"',
      }),
    attachments: Joi.array()
      .items(
        Joi.object({
          filename: Joi.string().min(1).max(255).required(),
          url: Joi.string().trim().min(1),
          path: Joi.string().trim().min(1),
        }).or('url', 'path')
      )
      .max(30)
      .default([]),
  }),
});

export default {
  sendEmailSchema,
};
