/**
 * Permission Controller
 * Handles HTTP requests for user permission operations.
 */

import { permissionService } from './permissions.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await permissionService.getUserPermissions(userId);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

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

export const resetUserPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await permissionService.resetUserPermissions(userId);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

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
 * Initialize permissions for a newly created user.
 * Note: this is a utility function, not an HTTP handler.
 */
export const initializeUserPermissions = async (userId) => {
  return permissionService.initializeUserPermissions(userId);
};

export const resetRolePermissions = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const result = await permissionService.resetRolePermissions(role);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

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

