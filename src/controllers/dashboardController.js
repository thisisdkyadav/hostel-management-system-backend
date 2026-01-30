/**
 * Dashboard Controller
 * Handles HTTP requests and responses for dashboard operations.
 * Business logic is delegated to dashboardService.
 * 
 * @module controllers/dashboardController
 */

import { dashboardService } from '../services/dashboard.service.js';
import { isDevelopmentEnvironment } from '../../config/environment.js';

/**
 * Get dashboard data for admin
 */
export const getDashboardData = async (req, res) => {
  try {
    const result = await dashboardService.getDashboardData();

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve dashboard data',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get student statistics only
 */
export const getStudentStatistics = async (req, res) => {
  const user = req.user;
  try {
    let hostelId = null;
    if (user.hostel) {
      hostelId = user.hostel._id;
    }
    const result = await dashboardService.getStudentStatistics(hostelId);

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Student statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve student statistics',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get hostel statistics only
 */
export const getHostelStatistics = async (req, res) => {
  try {
    const result = await dashboardService.getHostelStatistics();

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Hostel statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve hostel statistics',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get events data only
 */
export const getEventsData = async (req, res) => {
  try {
    const result = await dashboardService.getEventsData();

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Events data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve events data',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get complaints statistics only
 */
export const getComplaintsStatistics = async (req, res) => {
  try {
    const result = await dashboardService.getComplaintsStatistics();

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Complaints statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve complaints statistics',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get student count by gender
 */
export const getStudentCount = async (req, res) => {
  const user = req.user;
  try {
    let hostelId = null;
    if (user.hostel) {
      hostelId = user.hostel._id;
    }

    const result = await dashboardService.getStudentCount(hostelId);

    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
    });
  } catch (error) {
    console.error('Student count error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve student count',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get warden hostel statistics
 */
export const getWardenHostelStatistics = async (req, res) => {
  const user = req.user;
  try {
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
  } catch (error) {
    console.error('Warden hostel statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve warden hostel statistics',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

/**
 * Get users currently on leave
 */
export const getUsersOnLeave = async () => {
  return await dashboardService.getUsersOnLeave();
};
