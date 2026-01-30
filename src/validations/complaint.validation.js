/**
 * Complaint Validation Schemas
 */

import Joi from 'joi';
import { objectId, withPagination } from './common.validation.js';

/**
 * Create complaint
 * POST /api/complaint
 */
export const createComplaintSchema = Joi.object({
  body: Joi.object({
    userId: objectId.required(),
    title: Joi.string().min(5).max(200).required().messages({
      'string.min': 'Title must be at least 5 characters',
      'any.required': 'Title is required',
    }),
    description: Joi.string().min(10).max(2000).required().messages({
      'string.min': 'Description must be at least 10 characters',
      'any.required': 'Description is required',
    }),
    location: Joi.string().max(200),
    category: Joi.string().valid(
      'maintenance',
      'cleanliness',
      'food',
      'security',
      'electrical',
      'plumbing',
      'internet',
      'furniture',
      'other'
    ).default('other'),
    attachments: Joi.array().items(Joi.string().uri()).max(10),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  }),
});

/**
 * Get complaint by ID
 * GET /api/complaint/:id
 */
export const getComplaintByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Update complaint status
 * PUT /api/complaint/:id/status
 */
export const updateComplaintStatusSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(
      'pending',
      'acknowledged',
      'in_progress',
      'resolved',
      'closed',
      'rejected'
    ).required(),
    assignedTo: objectId,
    resolutionNotes: Joi.string().max(2000),
    feedback: Joi.string().max(1000),
    feedbackRating: Joi.number().integer().min(1).max(5),
  }),
});

/**
 * Get student complaints
 * GET /api/complaint/student/:userId
 */
export const getStudentComplaintsSchema = Joi.object({
  params: Joi.object({
    userId: objectId.required(),
  }),
  query: Joi.object({
    status: Joi.string().valid('pending', 'acknowledged', 'in_progress', 'resolved', 'closed', 'rejected'),
    category: Joi.string(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
});

/**
 * Update complaint status (simple)
 * PATCH /api/complaint/:complaintId/status
 */
export const complaintStatusUpdateSchema = Joi.object({
  params: Joi.object({
    complaintId: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(
      'pending',
      'acknowledged',
      'in_progress',
      'resolved',
      'closed',
      'rejected'
    ).required(),
  }),
});

/**
 * Update complaint resolution notes
 * PATCH /api/complaint/:complaintId/resolution
 */
export const updateComplaintResolutionNotesSchema = Joi.object({
  params: Joi.object({
    complaintId: objectId.required(),
  }),
  body: Joi.object({
    resolutionNotes: Joi.string().max(2000).required(),
  }),
});

/**
 * Update complaint feedback
 * PATCH /api/complaint/:complaintId/feedback
 */
export const updateComplaintFeedbackSchema = Joi.object({
  params: Joi.object({
    complaintId: objectId.required(),
  }),
  body: Joi.object({
    feedback: Joi.string().max(1000),
    feedbackRating: Joi.number().integer().min(1).max(5).required(),
    satisfactionStatus: Joi.string().valid('satisfied', 'unsatisfied', 'neutral'),
  }),
});

/**
 * Get all complaints with filters
 * GET /api/complaint
 */
export const getAllComplaintsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'acknowledged', 'in_progress', 'resolved', 'closed', 'rejected'),
    category: Joi.string(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    hostel: objectId,
    assignedTo: objectId,
    sortBy: Joi.string().valid('createdAt', 'updatedAt', 'priority', 'status'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
    search: Joi.string().max(200),
  }),
});

export default {
  createComplaintSchema,
  getComplaintByIdSchema,
  updateComplaintStatusSchema,
  getStudentComplaintsSchema,
  complaintStatusUpdateSchema,
  updateComplaintResolutionNotesSchema,
  updateComplaintFeedbackSchema,
  getAllComplaintsSchema,
};
