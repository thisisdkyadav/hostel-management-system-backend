import {
  getStudentDiningPortalState,
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
