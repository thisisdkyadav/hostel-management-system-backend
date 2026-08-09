/**
 * Dining Period Controller
 * Handles admin dining period master-data operations.
 */

import { diningPeriodService } from './dining-period.service.js';
import { asyncHandler } from '../../../../utils/index.js';
import {
  approveDiningRebate,
  getAdminDiningRebates,
  rejectDiningRebate,
} from '../../../../services/dining/dining-rebate.service.js';

export const getDiningPeriods = asyncHandler(async (req, res) => {
  const result = await diningPeriodService.getDiningPeriods(req.query.archive);
  res.status(result.statusCode).json(result.data);
});

export const createDiningPeriod = asyncHandler(async (req, res) => {
  const result = await diningPeriodService.createDiningPeriod(req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const updateDiningPeriod = asyncHandler(async (req, res) => {
  const result = await diningPeriodService.updateDiningPeriod(req.params.id, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const updateDiningPeriodArchiveStatus = asyncHandler(async (req, res) => {
  const result = await diningPeriodService.changeArchiveStatus(req.params.id, req.body.status);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const getDiningRebateRequests = asyncHandler(async (req, res) => {
  const result = await getAdminDiningRebates({ status: req.query?.status });
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const approveDiningRebateRequest = asyncHandler(async (req, res) => {
  const result = await approveDiningRebate({ rebateId: req.params.id, adminUserId: req.user._id });
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const rejectDiningRebateRequest = asyncHandler(async (req, res) => {
  const result = await rejectDiningRebate({
    rebateId: req.params.id,
    adminUserId: req.user._id,
    comment: req.body?.comment,
  });
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});
