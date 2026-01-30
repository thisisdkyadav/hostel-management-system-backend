/**
 * Permission Controller
 * Handles HTTP requests for user permission operations.
 * All business logic delegated to permissionService.
 * 
 * @module controllers/permission
 */

import { permissionService } from '../services/permission.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get permissions for a specific user
 */
export const getUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await permissionService.getUserPermissions(userId);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

/**
 * Update permissions for a specific user
 */
export const updateUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { permissions } = req.body;
  const result = await permissionService.updateUserPermissions(userId, permissions);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

/**
 * Reset a user's permissions to the default for their role
 */
export const resetUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await permissionService.resetUserPermissions(userId);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

/**
 * Get users by role with their permissions
 */
export const getUsersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { page, limit } = req.query;
  const result = await permissionService.getUsersByRole(role, { page, limit });

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
    pagination: result.pagination,
  });
});

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
export const resetRolePermissions = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const result = await permissionService.resetRolePermissions(role);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

/**
 * Set custom permissions for all users with a specific role
 */
export const setRolePermissions = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { permissions } = req.body;
  const result = await permissionService.setRolePermissions(role, permissions);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});
