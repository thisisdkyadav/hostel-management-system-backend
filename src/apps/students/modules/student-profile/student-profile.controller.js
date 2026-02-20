/**
 * Student Profile Controller
 * Handles HTTP requests for student profile operations.
 * All business logic delegated to studentProfileService.
 * 
 * @module controllers/studentProfile
 */

import { studentProfileService } from './student-profile.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Get only editable profile fields
 */
export const getEditableProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.getEditableProfile(userId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data.editableProfile,
    editableFields: result.data.editableFields,
  });
});

/**
 * Update student profile
 */
export const updateStudentProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.updateStudentProfile(userId, req.body, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      editableFields: result.data?.editableFields,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    message: result.message,
    data: result.data.profile,
    editableFields: result.data.editableFields,
  });
});

/**
 * Get student profile
 */
export const getStudentProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.getStudentProfile(userId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data.profile,
    editableFields: result.data.editableFields,
  });
});

/**
 * Get family members
 */
export const getFamilyMembers = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.getFamilyMembers(userId);

  return res.status(result.statusCode).json({
    message: result.message,
    data: result.data,
  });
});

/**
 * Add family member
 */
export const addFamilyMember = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.addFamilyMember(userId, req.body);

  return res.status(result.statusCode).json({
    message: result.message,
    data: result.data,
  });
});

/**
 * Update family member
 */
export const updateFamilyMember = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.updateFamilyMember(
    userId,
    req.params.id,
    req.body
  );

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    data: result.data,
  });
});

/**
 * Delete family member
 */
export const deleteFamilyMember = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.deleteFamilyMember(userId, req.params.id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

/**
 * Get health data
 */
export const getHealth = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await studentProfileService.getHealth(userId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    data: result.data,
  });
});
