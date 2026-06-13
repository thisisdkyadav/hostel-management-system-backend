/**
 * Dining Billing Controller
 * Admin billing-period management and per-student fund allocation.
 */

import { asyncHandler } from '../../../../utils/index.js';
import {
  bulkUpdateBillingAccounts,
  changeBillingPeriodArchiveStatus,
  createBillingPeriod,
  getBillingPeriodAccounts,
  getBillingPeriods,
  updateBillingPeriod,
} from './dining-billing.service.js';

const respond = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }
  return res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
};

export const getDiningBillingPeriods = asyncHandler(async (req, res) => {
  const result = await getBillingPeriods(req.query.archive);
  // List endpoint returns the array directly under data (matches dining-periods convention).
  res.status(result.statusCode).json(result.data);
});

export const createDiningBillingPeriod = asyncHandler(async (req, res) => {
  const result = await createBillingPeriod(req.body);
  respond(res, result);
});

export const updateDiningBillingPeriod = asyncHandler(async (req, res) => {
  const result = await updateBillingPeriod(req.params.id, req.body);
  respond(res, result);
});

export const updateDiningBillingPeriodArchiveStatus = asyncHandler(async (req, res) => {
  const result = await changeBillingPeriodArchiveStatus(req.params.id, req.body.status);
  respond(res, result);
});

export const getDiningBillingAccounts = asyncHandler(async (req, res) => {
  const result = await getBillingPeriodAccounts(req.params.id);
  respond(res, result);
});

export const bulkUpdateDiningBillingAccounts = asyncHandler(async (req, res) => {
  const result = await bulkUpdateBillingAccounts(req.params.id, {
    mode: req.body?.mode,
    entries: req.body?.entries,
    performedBy: req.user?._id,
  });
  respond(res, result);
});
