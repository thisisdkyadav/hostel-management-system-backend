/**
 * Associate Warden Controller
 * Handles HTTP requests for associate warden operations.
 * Business logic delegated to AssociateWardenService.
 * 
 * @module controllers/associateWarden
 */

import { associateWardenService } from '../services/associateWarden.service.js';

/**
 * Get associate warden profile
 * @route GET /api/associate-wardens/profile
 */
export const getAssociateWardenProfile = async (req, res) => {
  try {
    const result = await associateWardenService.getAssociateWardenProfile(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching associate warden profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a new associate warden
 * @route POST /api/associate-wardens
 */
export const createAssociateWarden = async (req, res) => {
  try {
    const result = await associateWardenService.createAssociateWarden(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error creating associate warden:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all associate wardens
 * @route GET /api/associate-wardens
 */
export const getAllAssociateWardens = async (req, res) => {
  try {
    const result = await associateWardenService.getAllAssociateWardens();
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting all associate wardens:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update associate warden
 * @route PUT /api/associate-wardens/:id
 */
export const updateAssociateWarden = async (req, res) => {
  try {
    const result = await associateWardenService.updateAssociateWarden(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message, success: true });
  } catch (error) {
    console.error('Error updating associate warden:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid Associate Warden ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete associate warden
 * @route DELETE /api/associate-wardens/:id
 */
export const deleteAssociateWarden = async (req, res) => {
  try {
    const result = await associateWardenService.deleteAssociateWarden(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error deleting associate warden:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Set active hostel for associate warden
 * @route POST /api/associate-wardens/active-hostel
 */
export const setActiveHostelAW = async (req, res) => {
  try {
    const result = await associateWardenService.setActiveHostelAW(req.user._id, req.body.hostelId, req.session);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error setting active hostel for Associate Warden:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid hostel ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
