/**
 * Visitor Validation Schemas
 */

import Joi from 'joi';
import { objectId, phone, name } from './common.validation.js';

/**
 * Visitor info schema
 */
const visitorInfoSchema = Joi.object({
  name: name.required(),
  phone: phone,
  relation: Joi.string().max(50),
  gender: Joi.string().valid('Male', 'Female', 'Other'),
  age: Joi.number().integer().min(1).max(120),
  idType: Joi.string().valid('aadhar', 'passport', 'driving_license', 'voter_id', 'other'),
  idNumber: Joi.string().max(50),
});

/**
 * Create visitor request
 * POST /api/visitor
 */
export const createVisitorRequestSchema = Joi.object({
  body: Joi.object({
    visitors: Joi.array().items(visitorInfoSchema).min(1).max(10).required(),
    reason: Joi.string().max(500).required(),
    fromDate: Joi.date().iso().required(),
    toDate: Joi.date().iso().greater(Joi.ref('fromDate')).required(),
    h2FormUrl: Joi.string().uri(),
  }),
});

/**
 * Get visitor request by ID
 * GET /api/visitor/:id
 */
export const getVisitorRequestByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Update visitor request
 * PUT /api/visitor/:id
 */
export const updateVisitorRequestSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    reason: Joi.string().max(500),
    fromDate: Joi.date().iso(),
    toDate: Joi.date().iso(),
    h2FormUrl: Joi.string().uri(),
    visitors: Joi.array().items(visitorInfoSchema).min(1).max(10),
  }),
});

/**
 * Delete visitor request
 * DELETE /api/visitor/:id
 */
export const deleteVisitorRequestSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Update visitor request status
 * PATCH /api/visitor/:id/status
 */
export const updateVisitorRequestStatusSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(
      'pending',
      'approved',
      'rejected',
      'checked_in',
      'checked_out',
      'cancelled'
    ),
    reason: Joi.string().max(500),
    hostelId: objectId,
    amount: Joi.number().min(0),
    approvalInformation: Joi.object({
      approvedBy: objectId,
      approvedAt: Joi.date().iso(),
      notes: Joi.string().max(500),
    }),
  }),
});

/**
 * Allocate rooms to visitor request
 * POST /api/visitor/:id/allocate-rooms
 */
export const allocateRoomsToVisitorRequestSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    allocationData: Joi.array().items(
      Joi.object({
        visitorId: objectId.required(),
        roomId: objectId.required(),
      })
    ).min(1).required(),
  }),
});

/**
 * Check in visitor
 * POST /api/visitor/:id/check-in
 */
export const checkInVisitorSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    checkInTime: Joi.date().iso(),
    notes: Joi.string().max(500),
  }),
});

/**
 * Check out visitor
 * POST /api/visitor/:id/check-out
 */
export const checkOutVisitorSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    checkOutTime: Joi.date().iso(),
    notes: Joi.string().max(500),
  }),
});

/**
 * Update check time
 * PATCH /api/visitor/:id/:visitorId/check-time
 */
export const updateCheckTimeSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
    visitorId: objectId.required(),
  }),
  body: Joi.object({
    checkInTime: Joi.date().iso(),
    checkOutTime: Joi.date().iso(),
    notes: Joi.string().max(500),
  }),
});

/**
 * Update payment info
 * PATCH /api/visitor/:id/payment
 */
export const updatePaymentInfoSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    amount: Joi.number().min(0).required(),
    dateOfPayment: Joi.date().iso(),
    screenshot: Joi.string().uri(),
    additionalInfo: Joi.string().max(500),
    transactionId: Joi.string().max(100),
  }),
});

/**
 * Get visitor requests with filters
 * GET /api/visitor
 */
export const getVisitorRequestsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('pending', 'approved', 'rejected', 'checked_in', 'checked_out', 'cancelled'),
    hostel: objectId,
    student: objectId,
    fromDate: Joi.date().iso(),
    toDate: Joi.date().iso(),
    sortBy: Joi.string().valid('createdAt', 'fromDate', 'status'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
});

export default {
  createVisitorRequestSchema,
  getVisitorRequestByIdSchema,
  updateVisitorRequestSchema,
  deleteVisitorRequestSchema,
  updateVisitorRequestStatusSchema,
  allocateRoomsToVisitorRequestSchema,
  checkInVisitorSchema,
  checkOutVisitorSchema,
  updateCheckTimeSchema,
  updatePaymentInfoSchema,
  getVisitorRequestsSchema,
};
