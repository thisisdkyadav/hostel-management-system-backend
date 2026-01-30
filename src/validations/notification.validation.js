/**
 * Notification Validation Schemas
 */

import Joi from 'joi';
import { objectId, pagination } from './common.validation.js';

/**
 * Notification types
 */
const notificationTypes = [
  'complaint', 'leave', 'visitor', 'event', 'payment', 
  'announcement', 'maintenance', 'security', 'general', 'system'
];

/**
 * Notification priorities
 */
const notificationPriorities = ['low', 'medium', 'high', 'urgent'];

/**
 * Create notification
 * POST /api/notifications
 */
export const createNotificationSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    message: Joi.string().max(2000).required(),
    type: Joi.string().valid(...notificationTypes).default('general'),
    priority: Joi.string().valid(...notificationPriorities).default('medium'),
    recipients: Joi.array().items(objectId).min(1),
    hostel: objectId,
    targetRole: Joi.string(),
    targetAll: Joi.boolean().default(false),
    metadata: Joi.object(),
    expiresAt: Joi.date().iso(),
  }),
});

/**
 * Send bulk notification
 * POST /api/notifications/bulk
 */
export const bulkNotificationSchema = Joi.object({
  body: Joi.object({
    title: Joi.string().min(3).max(200).required(),
    message: Joi.string().max(2000).required(),
    type: Joi.string().valid(...notificationTypes).default('announcement'),
    priority: Joi.string().valid(...notificationPriorities).default('medium'),
    recipientIds: Joi.array().items(objectId),
    hostelIds: Joi.array().items(objectId),
    roles: Joi.array().items(Joi.string()),
    sendToAll: Joi.boolean().default(false),
  }),
});

/**
 * Get notifications with filters
 * GET /api/notifications
 */
export const getNotificationsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    type: Joi.string().valid(...notificationTypes),
    priority: Joi.string().valid(...notificationPriorities),
    isRead: Joi.boolean(),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
  }),
});

/**
 * Get notification by ID
 * GET /api/notifications/:id
 */
export const getNotificationByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Mark notification as read
 * PATCH /api/notifications/:id/read
 */
export const markAsReadSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Mark multiple notifications as read
 * PATCH /api/notifications/read-multiple
 */
export const markMultipleAsReadSchema = Joi.object({
  body: Joi.object({
    notificationIds: Joi.array().items(objectId).min(1).required(),
  }),
});

/**
 * Mark all notifications as read
 * PATCH /api/notifications/read-all
 */
export const markAllAsReadSchema = Joi.object({
  // No parameters needed
});

/**
 * Delete notification
 * DELETE /api/notifications/:id
 */
export const deleteNotificationSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Delete multiple notifications
 * DELETE /api/notifications/delete-multiple
 */
export const deleteMultipleNotificationsSchema = Joi.object({
  body: Joi.object({
    notificationIds: Joi.array().items(objectId).min(1).required(),
  }),
});

/**
 * Update notification preferences
 * PUT /api/notifications/preferences
 */
export const updatePreferencesSchema = Joi.object({
  body: Joi.object({
    email: Joi.boolean(),
    push: Joi.boolean(),
    sms: Joi.boolean(),
    inApp: Joi.boolean(),
    types: Joi.object().pattern(
      Joi.string().valid(...notificationTypes),
      Joi.boolean()
    ),
    quietHours: Joi.object({
      enabled: Joi.boolean(),
      start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
      end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    }),
  }),
});

export default {
  createNotificationSchema,
  bulkNotificationSchema,
  getNotificationsSchema,
  getNotificationByIdSchema,
  markAsReadSchema,
  markMultipleAsReadSchema,
  markAllAsReadSchema,
  deleteNotificationSchema,
  deleteMultipleNotificationsSchema,
  updatePreferencesSchema,
};
