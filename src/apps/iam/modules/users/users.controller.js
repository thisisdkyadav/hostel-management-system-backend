/**
 * User Controller
 * Handles HTTP requests for user operations.
 */

import { userService } from './users.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const searchUsers = asyncHandler(async (req, res) => {
  const result = await userService.searchUsers(req.query);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const getUserById = asyncHandler(async (req, res) => {
  const result = await userService.getUserById(req.params.id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const getUsersByRole = asyncHandler(async (req, res) => {
  const result = await userService.getUsersByRole(req.query.role);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const bulkPasswordUpdate = asyncHandler(async (req, res) => {
  const result = await userService.bulkPasswordUpdate(req.body.passwordUpdates);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const removeUserPassword = asyncHandler(async (req, res) => {
  const result = await userService.removeUserPassword(req.params.id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const bulkRemovePasswords = asyncHandler(async (req, res) => {
  const result = await userService.bulkRemovePasswords(req.body.emails);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const removePasswordsByRole = asyncHandler(async (req, res) => {
  const result = await userService.removePasswordsByRole(req.body.role);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

