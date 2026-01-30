/**
 * Hostel Supervisor Controller
 * Handles HTTP requests for hostel supervisor operations.
 * Business logic delegated to HostelSupervisorService.
 * 
 * @module controllers/hostelSupervisor
 */

import { hostelSupervisorService } from '../services/hostelSupervisor.service.js';

/**
 * Get hostel supervisor profile
 * @route GET /api/hostel-supervisors/profile
 */
export const getHostelSupervisorProfile = async (req, res) => {
  try {
    const result = await hostelSupervisorService.getHostelSupervisorProfile(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching hostel supervisor profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a new hostel supervisor
 * @route POST /api/hostel-supervisors
 */
export const createHostelSupervisor = async (req, res) => {
  try {
    const result = await hostelSupervisorService.createHostelSupervisor(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error creating hostel supervisor:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all hostel supervisors
 * @route GET /api/hostel-supervisors
 */
export const getAllHostelSupervisors = async (req, res) => {
  try {
    const result = await hostelSupervisorService.getAllHostelSupervisors();
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting all hostel supervisors:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update hostel supervisor
 * @route PUT /api/hostel-supervisors/:id
 */
export const updateHostelSupervisor = async (req, res) => {
  try {
    const result = await hostelSupervisorService.updateHostelSupervisor(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message, success: true });
  } catch (error) {
    console.error('Error updating hostel supervisor:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid Hostel Supervisor ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete hostel supervisor
 * @route DELETE /api/hostel-supervisors/:id
 */
export const deleteHostelSupervisor = async (req, res) => {
  try {
    const result = await hostelSupervisorService.deleteHostelSupervisor(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error deleting hostel supervisor:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Set active hostel for hostel supervisor
 * @route POST /api/hostel-supervisors/active-hostel
 */
export const setActiveHostelHS = async (req, res) => {
  try {
    const result = await hostelSupervisorService.setActiveHostelHS(req.user._id, req.body.hostelId, req.session);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error setting active hostel for Hostel Supervisor:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid hostel ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
