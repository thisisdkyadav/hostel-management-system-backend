/**
 * Dashboard Controller
 * Handles HTTP requests and responses for dashboard operations.
 * Business logic is delegated to dashboardService.
 * 
 * @module controllers/dashboardController
 */

import { dashboardService } from './dashboard.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Get dashboard data for admin
 */
export const getDashboardData = asyncHandler(async (req, res) => {
  const result = await dashboardService.getDashboardData();

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get student statistics only
 */
export const getStudentStatistics = asyncHandler(async (req, res) => {
  const user = req.user;
  let hostelId = null;
  if (user.hostel) {
    hostelId = user.hostel._id;
  }
  const result = await dashboardService.getStudentStatistics(hostelId);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get hostel statistics only
 */
export const getHostelStatistics = asyncHandler(async (req, res) => {
  const result = await dashboardService.getHostelStatistics();

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get events data only
 */
export const getEventsData = asyncHandler(async (req, res) => {
  const result = await dashboardService.getEventsData();

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get complaints statistics only
 */
export const getComplaintsStatistics = asyncHandler(async (req, res) => {
  const result = await dashboardService.getComplaintsStatistics();

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get student count by gender
 */
export const getStudentCount = asyncHandler(async (req, res) => {
  const user = req.user;
  let hostelId = null;
  if (user.hostel) {
    hostelId = user.hostel._id;
  }

  const result = await dashboardService.getStudentCount(hostelId);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get warden hostel statistics
 */
export const getWardenHostelStatistics = asyncHandler(async (req, res) => {
  const user = req.user;
  const hostelId = user?.hostel?._id;

  const result = await dashboardService.getWardenHostelStatistics(hostelId);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
  });
});

/**
 * Get users currently on leave
 */
export const getUsersOnLeave = async () => {
  return await dashboardService.getUsersOnLeave();
};
