/**
 * Hostel Supervisor Controller
 * Handles HTTP requests for hostel supervisor operations.
 * Business logic delegated to HostelSupervisorService.
 * 
 * @module controllers/hostelSupervisor
 */

import { hostelSupervisorService } from '../services/hostelSupervisor.service.js';
import { asyncHandler } from '../../../utils/index.js';

/**
 * Get hostel supervisor profile
 * @route GET /api/hostel-supervisors/profile
 */
export const getHostelSupervisorProfile = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.getHostelSupervisorProfile(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Create a new hostel supervisor
 * @route POST /api/hostel-supervisors
 */
export const createHostelSupervisor = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.createHostelSupervisor(req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Get all hostel supervisors
 * @route GET /api/hostel-supervisors
 */
export const getAllHostelSupervisors = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.getAllHostelSupervisors();
  
  res.status(result.statusCode).json(result.data);
});

/**
 * Update hostel supervisor
 * @route PUT /api/hostel-supervisors/:id
 */
export const updateHostelSupervisor = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.updateHostelSupervisor(req.params.id, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message, success: true });
});

/**
 * Delete hostel supervisor
 * @route DELETE /api/hostel-supervisors/:id
 */
export const deleteHostelSupervisor = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.deleteHostelSupervisor(req.params.id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

/**
 * Set active hostel for hostel supervisor
 * @route POST /api/hostel-supervisors/active-hostel
 */
export const setActiveHostelHS = asyncHandler(async (req, res) => {
  const result = await hostelSupervisorService.setActiveHostelHS(req.user._id, req.body.hostelId, req.session);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});
