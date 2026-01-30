/**
 * Associate Warden Controller
 * Handles HTTP requests for associate warden operations.
 * Business logic delegated to AssociateWardenService.
 * 
 * @module controllers/associateWarden
 */

import { associateWardenService } from '../services/associateWarden.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get associate warden profile
 * @route GET /api/associate-wardens/profile
 */
export const getAssociateWardenProfile = asyncHandler(async (req, res) => {
  const result = await associateWardenService.getAssociateWardenProfile(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Create a new associate warden
 * @route POST /api/associate-wardens
 */
export const createAssociateWarden = asyncHandler(async (req, res) => {
  const result = await associateWardenService.createAssociateWarden(req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Get all associate wardens
 * @route GET /api/associate-wardens
 */
export const getAllAssociateWardens = asyncHandler(async (req, res) => {
  const result = await associateWardenService.getAllAssociateWardens();
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Update associate warden
 * @route PUT /api/associate-wardens/:id
 */
export const updateAssociateWarden = asyncHandler(async (req, res) => {
  const result = await associateWardenService.updateAssociateWarden(req.params.id, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message, success: true });
});

/**
 * Delete associate warden
 * @route DELETE /api/associate-wardens/:id
 */
export const deleteAssociateWarden = asyncHandler(async (req, res) => {
  const result = await associateWardenService.deleteAssociateWarden(req.params.id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Set active hostel for associate warden
 * @route POST /api/associate-wardens/active-hostel
 */
export const setActiveHostelAW = asyncHandler(async (req, res) => {
  const result = await associateWardenService.setActiveHostelAW(req.user._id, req.body.hostelId, req.session);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});
