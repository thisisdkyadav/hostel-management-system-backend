/**
 * Admin Controller
 * Handles HTTP requests for admin operations.
 * All business logic delegated to adminService.
 * 
 * @module controllers/admin
 */

import { adminService } from '../services/admin.service.js';
import { asyncHandler } from '../../../utils/index.js';

/**
 * Create a security user
 */
export const createSecurity = asyncHandler(async (req, res) => {
  const result = await adminService.createSecurity(req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    security: result.data.security,
  });
});

/**
 * Get all securities
 */
export const getAllSecurities = asyncHandler(async (req, res) => {
  const result = await adminService.getAllSecurities();
  return res.status(result.statusCode).json(result.data);
});

/**
 * Update a security
 */
export const updateSecurity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.updateSecurity(id, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

/**
 * Delete a security
 */
export const deleteSecurity = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.deleteSecurity(id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

/**
 * Update user password
 */
export const updateUserPassword = asyncHandler(async (req, res) => {
  const { email, newPassword } = req.body;
  const result = await adminService.updateUserPassword(email, newPassword);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

/**
 * Create a maintenance staff
 */
export const createMaintenanceStaff = asyncHandler(async (req, res) => {
  const result = await adminService.createMaintenanceStaff(req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

/**
 * Get all maintenance staff
 */
export const getAllMaintenanceStaff = asyncHandler(async (req, res) => {
  const result = await adminService.getAllMaintenanceStaff();
  return res.status(result.statusCode).json(result.data);
});

/**
 * Update a maintenance staff
 */
export const updateMaintenanceStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.updateMaintenanceStaff(id, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

/**
 * Delete a maintenance staff
 */
export const deleteMaintenanceStaff = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.deleteMaintenanceStaff(id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

/**
 * Get task statistics
 */
export const getTaskStats = asyncHandler(async (req, res) => {
  const result = await adminService.getTaskStats();
  return res.status(result.statusCode).json(result.data);
});

/**
 * Get maintenance staff statistics
 */
export const getMaintenanceStaffStats = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const result = await adminService.getMaintenanceStaffStats(staffId);
  return res.status(result.statusCode).json({
    success: true,
    data: result.data,
  });
});
