/**
 * Dining Period Controller
 * Handles admin dining period master-data operations.
 */

import { diningPeriodService } from './dining-period.service.js';
import { asyncHandler } from '../../../../utils/index.js';

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
