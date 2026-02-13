/**
 * Stats Controller
 * Handles HTTP requests for statistics operations.
 * Business logic delegated to StatsService.
 * 
 * @module controllers/stats
 */

import { statsService } from './stats.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Get hostel statistics
 * @route GET /api/stats/hostels
 */
export const getHostelStats = asyncHandler(async (req, res) => {
  const result = await statsService.getHostelStats();
  res.status(result.statusCode).json(result.data);
});

/**
 * Get warden statistics
 * @route GET /api/stats/wardens
 */
export const getWardenStats = asyncHandler(async (req, res) => {
  const result = await statsService.getWardenStats();
  res.status(result.statusCode).json(result.data);
});

/**
 * Get event statistics for a hostel
 * @route GET /api/stats/events/:hostelId
 */
export const getEventStats = asyncHandler(async (req, res) => {
  const result = await statsService.getEventStats(req.params.hostelId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Get lost and found statistics
 * @route GET /api/stats/lost-and-found
 */
export const getLostAndFoundStats = asyncHandler(async (req, res) => {
  const result = await statsService.getLostAndFoundStats();
  res.status(result.statusCode).json(result.data);
});

/**
 * Get security staff statistics
 * @route GET /api/stats/security
 */
export const getSecurityStaffStats = asyncHandler(async (req, res) => {
  const result = await statsService.getSecurityStaffStats();
  res.status(result.statusCode).json(result.data);
});

/**
 * Get maintenance staff statistics
 * @route GET /api/stats/maintenance
 */
export const getMaintenanceStaffStats = asyncHandler(async (req, res) => {
  const result = await statsService.getMaintenanceStaffStats();
  res.status(result.statusCode).json(result.data);
});

/**
 * Get room statistics for a hostel
 * @route GET /api/stats/rooms/:hostelId
 */
export const getRoomStats = asyncHandler(async (req, res) => {
  const result = await statsService.getRoomStats(req.params.hostelId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Get room change request statistics for a hostel
 * @route GET /api/stats/room-change-requests/:hostelId
 */
export const getRoomChangeRequestStats = asyncHandler(async (req, res) => {
  const result = await statsService.getRoomChangeRequestStats(req.params.hostelId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Get visitor statistics for a hostel
 * @route GET /api/stats/visitors/:hostelId
 */
export const getVisitorStats = asyncHandler(async (req, res) => {
  const result = await statsService.getVisitorStats(req.params.hostelId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Get complaint statistics
 * @route GET /api/stats/complaints
 */
export const getComplaintsStats = asyncHandler(async (req, res) => {
  const result = await statsService.getComplaintsStats();
  res.status(result.statusCode).json(result.data);
});
