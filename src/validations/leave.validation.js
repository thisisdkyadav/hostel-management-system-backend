/**
 * Leave Validation Schemas
 */

import Joi from 'joi';
import { objectId } from './common.validation.js';

/**
 * Create leave request
 * POST /api/leave
 */
export const createLeaveSchema = Joi.object({
  body: Joi.object({
    reason: Joi.string().min(10).max(1000).required().messages({
      'string.min': 'Reason must be at least 10 characters',
      'any.required': 'Reason is required',
    }),
    startDate: Joi.date().iso().required().messages({
      'any.required': 'Start date is required',
    }),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required().messages({
      'any.required': 'End date is required',
      'date.greater': 'End date must be after start date',
    }),
    leaveType: Joi.string().valid('home', 'medical', 'emergency', 'other').default('home'),
    destination: Joi.string().max(200),
    contactNumber: Joi.string().pattern(/^[0-9]{10}$/),
    parentApproval: Joi.boolean(),
  }),
});

/**
 * Get leave by ID
 * GET /api/leave/:id
 */
export const getLeaveByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Approve leave
 * PATCH /api/leave/:id/approve
 */
export const approveLeaveSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    approvalInfo: Joi.string().max(500),
  }),
});

/**
 * Reject leave
 * PATCH /api/leave/:id/reject
 */
export const rejectLeaveSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    reasonForRejection: Joi.string().max(500).required().messages({
      'any.required': 'Reason for rejection is required',
    }),
  }),
});

/**
 * Join leave (mark as returned)
 * PATCH /api/leave/:id/join
 */
export const joinLeaveSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    joinInfo: Joi.string().max(500),
    joinTime: Joi.date().iso(),
  }),
});

/**
 * Cancel leave
 * PATCH /api/leave/:id/cancel
 */
export const cancelLeaveSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    reason: Joi.string().max(500),
  }),
});

/**
 * Get leaves with filters
 * GET /api/leave
 */
export const getLeavesSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'completed', 'cancelled'),
    hostel: objectId,
    student: objectId,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    leaveType: Joi.string().valid('home', 'medical', 'emergency', 'other'),
    sortBy: Joi.string().valid('createdAt', 'startDate', 'endDate', 'status'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

/**
 * Get my leaves
 * GET /api/leave/my
 */
export const getMyLeavesSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'completed', 'cancelled'),
  }),
});

export default {
  createLeaveSchema,
  getLeaveByIdSchema,
  approveLeaveSchema,
  rejectLeaveSchema,
  joinLeaveSchema,
  cancelLeaveSchema,
  getLeavesSchema,
  getMyLeavesSchema,
};
