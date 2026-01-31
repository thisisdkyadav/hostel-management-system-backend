/**
 * @fileoverview Grievance Validation Schemas
 * @description Joi validation schemas for grievance endpoints
 * @module apps/student-affairs/modules/grievance/validation
 */

import Joi from 'joi';
import {
  objectId,
  name as title,
  paginationSchema,
} from '../../../../validations/common.validation.js';

// Description schema (not in common, define locally)
const description = Joi.string().trim().min(10).max(5000);
import { GRIEVANCE_STATUS, GRIEVANCE_CATEGORY, GRIEVANCE_PRIORITY } from './grievance.constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PARAM SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ID parameter validation
 */
export const idParamSchema = Joi.object({
  id: objectId.required().messages({
    'any.required': 'Grievance ID is required',
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create grievance validation
 */
export const createGrievanceSchema = Joi.object({
  title: title.required().messages({
    'any.required': 'Title is required',
  }),

  description: description.required().messages({
    'any.required': 'Description is required',
  }),

  category: Joi.string()
    .valid(...Object.values(GRIEVANCE_CATEGORY))
    .required()
    .messages({
      'any.only': 'Invalid category',
      'any.required': 'Category is required',
    }),

  priority: Joi.string()
    .valid(...Object.values(GRIEVANCE_PRIORITY))
    .default(GRIEVANCE_PRIORITY.MEDIUM)
    .messages({
      'any.only': 'Invalid priority',
    }),

  isAnonymous: Joi.boolean().default(false),

  attachments: Joi.array()
    .items(
      Joi.object({
        filename: Joi.string().required(),
        url: Joi.string().uri().required(),
      })
    )
    .max(5)
    .messages({
      'array.max': 'Maximum 5 attachments allowed',
    }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get grievances query validation
 */
export const getGrievancesSchema = paginationSchema.keys({
  status: Joi.string()
    .valid(...Object.values(GRIEVANCE_STATUS))
    .messages({
      'any.only': 'Invalid status filter',
    }),

  category: Joi.string()
    .valid(...Object.values(GRIEVANCE_CATEGORY))
    .messages({
      'any.only': 'Invalid category filter',
    }),

  priority: Joi.string()
    .valid(...Object.values(GRIEVANCE_PRIORITY))
    .messages({
      'any.only': 'Invalid priority filter',
    }),

  assignedTo: objectId.messages({
    'string.pattern.base': 'Invalid assignee ID',
  }),

  search: Joi.string().max(100),
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update grievance status validation
 */
export const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...Object.values(GRIEVANCE_STATUS))
    .required()
    .messages({
      'any.only': 'Invalid status',
      'any.required': 'Status is required',
    }),

  notes: Joi.string().max(1000).trim().allow('').messages({
    'string.max': 'Notes cannot exceed 1000 characters',
  }),
});

/**
 * Assign grievance validation
 */
export const assignGrievanceSchema = Joi.object({
  assigneeId: objectId.required().messages({
    'any.required': 'Assignee ID is required',
    'string.pattern.base': 'Invalid assignee ID',
  }),

  notes: Joi.string().max(500).trim().allow(''),
});

/**
 * Add comment validation
 */
export const addCommentSchema = Joi.object({
  content: Joi.string().min(1).max(2000).trim().required().messages({
    'string.min': 'Comment cannot be empty',
    'string.max': 'Comment cannot exceed 2000 characters',
    'any.required': 'Comment content is required',
  }),

  isInternal: Joi.boolean().default(false),
});

/**
 * Resolve grievance validation
 */
export const resolveGrievanceSchema = Joi.object({
  resolution: Joi.string().min(10).max(2000).trim().required().messages({
    'string.min': 'Resolution must be at least 10 characters',
    'string.max': 'Resolution cannot exceed 2000 characters',
    'any.required': 'Resolution is required',
  }),
});

/**
 * Rate resolution validation
 */
export const rateResolutionSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required().messages({
    'number.min': 'Rating must be at least 1',
    'number.max': 'Rating cannot exceed 5',
    'any.required': 'Rating is required',
  }),

  feedback: Joi.string().max(500).trim().allow(''),
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  idParamSchema,
  createGrievanceSchema,
  getGrievancesSchema,
  updateStatusSchema,
  assignGrievanceSchema,
  addCommentSchema,
  resolveGrievanceSchema,
  rateResolutionSchema,
};
