/**
 * Profiles Self Controller
 * Student-facing dashboard/profile and ID card operations.
 */

import { profilesSelfService } from './profiles-self.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getStudentProfile = asyncHandler(async (req, res) => {
  const result = await profilesSelfService.getStudentProfile(req.user._id);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data,
  });
});

export const getStudentDashboard = asyncHandler(async (req, res) => {
  const result = await profilesSelfService.getStudentDashboard(req.user._id);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data,
  });
});

export const getStudentIdCard = asyncHandler(async (req, res) => {
  const result = await profilesSelfService.getStudentIdCard(req.params.userId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const uploadStudentIdCard = asyncHandler(async (req, res) => {
  const result = await profilesSelfService.uploadStudentIdCard(req.user, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({ message: result.message });
});
