/**
 * Event Validation Schemas
 */

import Joi from 'joi';
import { objectId, pagination } from './common.validation.js';

/**
 * Event types
 */
const eventTypes = ['cultural', 'sports', 'academic', 'social', 'maintenance', 'meeting', 'other'];

/**
 * Event status
 */
const eventStatuses = ['scheduled', 'ongoing', 'completed', 'cancelled'];

/**
 * Create event
 * POST /api/events
 */
export const createEventSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    description: Joi.string().max(2000),
    eventType: Joi.string().valid(...eventTypes).default('other'),
    hostel: objectId,
    location: Joi.string().max(200),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')),
    organizer: Joi.string().max(200),
    capacity: Joi.number().integer().min(1),
    registrationRequired: Joi.boolean().default(false),
    registrationDeadline: Joi.date().iso(),
    attachments: Joi.array().items(Joi.string()).max(10),
    isPublic: Joi.boolean().default(true),
  }),
});

/**
 * Update event
 * PUT /api/events/:id
 */
export const updateEventSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    title: Joi.string().min(3).max(200),
    description: Joi.string().max(2000),
    eventType: Joi.string().valid(...eventTypes),
    location: Joi.string().max(200),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    organizer: Joi.string().max(200),
    capacity: Joi.number().integer().min(1),
    registrationRequired: Joi.boolean(),
    registrationDeadline: Joi.date().iso(),
    attachments: Joi.array().items(Joi.string()).max(10),
    isPublic: Joi.boolean(),
    status: Joi.string().valid(...eventStatuses),
  }),
});

/**
 * Get event by ID
 * GET /api/events/:id
 */
export const getEventByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Get events with filters
 * GET /api/events
 */
export const getEventsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    hostel: objectId,
    eventType: Joi.string().valid(...eventTypes),
    status: Joi.string().valid(...eventStatuses),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    isPublic: Joi.boolean(),
    search: Joi.string().max(200),
  }),
});

/**
 * Register for event
 * POST /api/events/:id/register
 */
export const registerEventSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    studentId: objectId,
    notes: Joi.string().max(500),
  }),
});

/**
 * Cancel event registration
 * DELETE /api/events/:id/register
 */
export const cancelRegistrationSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Update event status
 * PATCH /api/events/:id/status
 */
export const updateEventStatusSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(...eventStatuses).required(),
    reason: Joi.string().max(500),
  }),
});

/**
 * Delete event
 * DELETE /api/events/:id
 */
export const deleteEventSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

export default {
  createEventSchema,
  updateEventSchema,
  getEventByIdSchema,
  getEventsSchema,
  registerEventSchema,
  cancelRegistrationSchema,
  updateEventStatusSchema,
  deleteEventSchema,
};
