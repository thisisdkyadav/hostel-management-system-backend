/**
 * Caterer Controller
 * Handles admin dining caterer master-data operations.
 */

import { catererService } from './caterer.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getCaterers = asyncHandler(async (req, res) => {
  const result = await catererService.getCaterers(req.query.archive);
  res.status(result.statusCode).json(result.data);
});

export const createCaterer = asyncHandler(async (req, res) => {
  const result = await catererService.createCaterer(req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const updateCaterer = asyncHandler(async (req, res) => {
  const result = await catererService.updateCaterer(req.params.id, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});

export const updateCatererArchiveStatus = asyncHandler(async (req, res) => {
  const result = await catererService.changeArchiveStatus(req.params.id, req.body.status);

  if (!result.success) {
    return res.status(result.statusCode).json({ success: false, message: result.message });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data,
  });
});
