/**
 * Permission Controller
 * Handles HTTP requests for user permission operations.
 * All business logic delegated to permissionService.
 * 
 * @module controllers/permission
 */

import { permissionService } from '../services/permission.service.js';
import { isDevelopmentEnvironment } from '../../config/environment.js';

/**
 * Get permissions for a specific user
 */
export const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await permissionService.getUserPermissions(userId);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Get user permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user permissions',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Update permissions for a specific user
 */
export const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    const result = await permissionService.updateUserPermissions(userId, permissions);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Update user permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user permissions',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Reset a user's permissions to the default for their role
 */
export const resetUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await permissionService.resetUserPermissions(userId);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Reset user permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset user permissions',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get users by role with their permissions
 */
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { page, limit } = req.query;
    const result = await permissionService.getUsersByRole(role, { page, limit });

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('Get users by role error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Initialize permissions for a newly created user
 * Note: This is a utility function, not an HTTP handler
 */
export const initializeUserPermissions = async (userId) => {
  return permissionService.initializeUserPermissions(userId);
};

/**
 * Reset permissions for all users with a specific role
 */
export const resetRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;
    const result = await permissionService.resetRolePermissions(role);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Reset role permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset role permissions',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Set custom permissions for all users with a specific role
 */
export const setRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;
    const result = await permissionService.setRolePermissions(role, permissions);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Set role permissions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set role permissions',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};
