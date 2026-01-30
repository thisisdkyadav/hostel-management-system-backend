/**
 * Stats Controller
 * Handles HTTP requests for statistics operations.
 * Business logic delegated to StatsService.
 * 
 * @module controllers/stats
 */

import { statsService } from '../services/stats.service.js';

/**
 * Get hostel statistics
 * @route GET /api/stats/hostels
 */
export const getHostelStats = async (req, res) => {
  try {
    const result = await statsService.getHostelStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get warden statistics
 * @route GET /api/stats/wardens
 */
export const getWardenStats = async (req, res) => {
  try {
    const result = await statsService.getWardenStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get event statistics for a hostel
 * @route GET /api/stats/events/:hostelId
 */
export const getEventStats = async (req, res) => {
  try {
    const result = await statsService.getEventStats(req.params.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get lost and found statistics
 * @route GET /api/stats/lost-and-found
 */
export const getLostAndFoundStats = async (req, res) => {
  try {
    const result = await statsService.getLostAndFoundStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get security staff statistics
 * @route GET /api/stats/security
 */
export const getSecurityStaffStats = async (req, res) => {
  try {
    const result = await statsService.getSecurityStaffStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get maintenance staff statistics
 * @route GET /api/stats/maintenance
 */
export const getMaintenanceStaffStats = async (req, res) => {
  try {
    const result = await statsService.getMaintenanceStaffStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get room statistics for a hostel
 * @route GET /api/stats/rooms/:hostelId
 */
export const getRoomStats = async (req, res) => {
  try {
    const result = await statsService.getRoomStats(req.params.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get room change request statistics for a hostel
 * @route GET /api/stats/room-change-requests/:hostelId
 */
export const getRoomChangeRequestStats = async (req, res) => {
  try {
    const result = await statsService.getRoomChangeRequestStats(req.params.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get visitor statistics for a hostel
 * @route GET /api/stats/visitors/:hostelId
 */
export const getVisitorStats = async (req, res) => {
  try {
    const result = await statsService.getVisitorStats(req.params.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get complaint statistics
 * @route GET /api/stats/complaints
 */
export const getComplaintsStats = async (req, res) => {
  try {
    const result = await statsService.getComplaintsStats();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
