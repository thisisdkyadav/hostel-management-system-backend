/**
 * Warden Controller
 * Handles HTTP requests for warden operations.
 * Business logic delegated to WardenService.
 * 
 * @module controllers/warden
 */

import { wardenService } from '../services/warden.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get warden profile
 * @route GET /api/wardens/profile
 */
export const getWardenProfile = asyncHandler(async (req, res) => {
  const result = await wardenService.getWardenProfile(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Create a new warden
 * @route POST /api/wardens
 */
export const createWarden = asyncHandler(async (req, res) => {
  const result = await wardenService.createWarden(req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Get all wardens
 * @route GET /api/wardens
 */
export const getAllWardens = asyncHandler(async (req, res) => {
  const result = await wardenService.getAllWardens();
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Update warden
 * @route PUT /api/wardens/:id
 */
export const updateWarden = asyncHandler(async (req, res) => {
  const result = await wardenService.updateWarden(req.params.id, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Delete warden
 * @route DELETE /api/wardens/:id
 */
export const deleteWarden = asyncHandler(async (req, res) => {
  const result = await wardenService.deleteWarden(req.params.id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Set active hostel for warden
 * @route POST /api/wardens/active-hostel
 */
export const setActiveHostel = asyncHandler(async (req, res) => {
  const result = await wardenService.setActiveHostel(req.user._id, req.body.hostelId, req.session);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});
