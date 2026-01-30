/**
 * Payment Validation Schemas
 */

import Joi from 'joi';
import { objectId, pagination } from './common.validation.js';

/**
 * Payment types
 */
const paymentTypes = ['hostel_fee', 'mess_fee', 'security_deposit', 'fine', 'other'];

/**
 * Payment statuses
 */
const paymentStatuses = ['pending', 'completed', 'failed', 'refunded', 'cancelled'];

/**
 * Payment methods
 */
const paymentMethods = ['online', 'cash', 'bank_transfer', 'upi', 'card', 'cheque'];

/**
 * Create payment
 * POST /api/payments
 */
export const createPaymentSchema = Joi.object({
  body: Joi.object({
    student: objectId.required(),
    amount: Joi.number().positive().required(),
    type: Joi.string().valid(...paymentTypes).required(),
    description: Joi.string().max(500),
    dueDate: Joi.date().iso(),
    hostel: objectId,
    metadata: Joi.object(),
  }),
});

/**
 * Process payment
 * POST /api/payments/:id/process
 */
export const processPaymentSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    method: Joi.string().valid(...paymentMethods).required(),
    transactionId: Joi.string().max(100),
    paymentDetails: Joi.object(),
    receivedAmount: Joi.number().positive(),
    remarks: Joi.string().max(500),
  }),
});

/**
 * Verify payment
 * POST /api/payments/:id/verify
 */
export const verifyPaymentSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    transactionId: Joi.string().required(),
    orderId: Joi.string(),
    signature: Joi.string(),
    provider: Joi.string().valid('razorpay', 'paytm', 'stripe', 'manual'),
  }),
});

/**
 * Get payment by ID
 * GET /api/payments/:id
 */
export const getPaymentByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Get payments with filters
 * GET /api/payments
 */
export const getPaymentsSchema = Joi.object({
  query: Joi.object({
    ...pagination,
    student: objectId,
    hostel: objectId,
    type: Joi.string().valid(...paymentTypes),
    status: Joi.string().valid(...paymentStatuses),
    method: Joi.string().valid(...paymentMethods),
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    minAmount: Joi.number().min(0),
    maxAmount: Joi.number().min(0),
  }),
});

/**
 * Refund payment
 * POST /api/payments/:id/refund
 */
export const refundPaymentSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive(),
    reason: Joi.string().max(500).required(),
    refundMethod: Joi.string().valid(...paymentMethods),
  }),
});

/**
 * Update payment status
 * PATCH /api/payments/:id/status
 */
export const updatePaymentStatusSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    status: Joi.string().valid(...paymentStatuses).required(),
    remarks: Joi.string().max(500),
  }),
});

/**
 * Create bulk payments
 * POST /api/payments/bulk
 */
export const bulkPaymentSchema = Joi.object({
  body: Joi.object({
    payments: Joi.array().items(
      Joi.object({
        student: objectId.required(),
        amount: Joi.number().positive().required(),
        type: Joi.string().valid(...paymentTypes).required(),
        description: Joi.string().max(500),
        dueDate: Joi.date().iso(),
      })
    ).min(1).max(500).required(),
    hostel: objectId,
  }),
});

/**
 * Generate payment receipt
 * GET /api/payments/:id/receipt
 */
export const generateReceiptSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Get payment summary/stats
 * GET /api/payments/summary
 */
export const paymentSummarySchema = Joi.object({
  query: Joi.object({
    hostel: objectId,
    startDate: Joi.date().iso(),
    endDate: Joi.date().iso(),
    type: Joi.string().valid(...paymentTypes),
    groupBy: Joi.string().valid('day', 'week', 'month', 'type', 'hostel'),
  }),
});

export default {
  createPaymentSchema,
  processPaymentSchema,
  verifyPaymentSchema,
  getPaymentByIdSchema,
  getPaymentsSchema,
  refundPaymentSchema,
  updatePaymentStatusSchema,
  bulkPaymentSchema,
  generateReceiptSchema,
  paymentSummarySchema,
};
