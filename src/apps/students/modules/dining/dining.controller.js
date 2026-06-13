import {
  getStudentDiningPortalState,
  listStudentDiningBilling,
  listStudentDiningRebates,
  requestStudentDiningRebate,
  selectStudentDiningCaterer,
} from './dining.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getDiningPortalState = asyncHandler(async (req, res) => {
  const result = await getStudentDiningPortalState(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const selectDiningCaterer = asyncHandler(async (req, res) => {
  const result = await selectStudentDiningCaterer(req.user._id, req.body?.catererId);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningRebates = asyncHandler(async (req, res) => {
  const result = await listStudentDiningRebates(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const createDiningRebate = asyncHandler(async (req, res) => {
  const result = await requestStudentDiningRebate(req.user._id, req.body || {});
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningBilling = asyncHandler(async (req, res) => {
  const result = await listStudentDiningBilling(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});
