/**
 * Student Profile Controller
 * Handles HTTP requests for student profile operations.
 * All business logic delegated to studentProfileService.
 * 
 * @module controllers/studentProfile
 */

import { studentProfileService } from '../services/studentProfile.service.js';

/**
 * Get only editable profile fields
 */
export const getEditableProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.getEditableProfile(userId);

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
  } catch (error) {
    console.error('Error fetching editable profile fields:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch editable profile fields',
      error: error.message,
    });
  }
};

/**
 * Update student profile
 */
export const updateStudentProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.updateStudentProfile(userId, req.body);

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
  } catch (error) {
    console.error('Error updating student profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message,
    });
  }
};

/**
 * Get student profile
 */
export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.getStudentProfile(userId);

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
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
    });
  }
};

/**
 * Get family members
 */
export const getFamilyMembers = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.getFamilyMembers(userId);

    return res.status(result.statusCode).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};

/**
 * Add family member
 */
export const addFamilyMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.addFamilyMember(userId, req.body);

    return res.status(result.statusCode).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};

/**
 * Update family member
 */
export const updateFamilyMember = async (req, res) => {
  try {
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
  } catch (error) {
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};

/**
 * Delete family member
 */
export const deleteFamilyMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.deleteFamilyMember(userId, req.params.id);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};

/**
 * Get health data
 */
export const getHealth = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await studentProfileService.getHealth(userId);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};
