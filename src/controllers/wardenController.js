/**
 * Warden Controller
 * Handles HTTP requests for warden operations.
 * Business logic delegated to WardenService.
 * 
 * @module controllers/warden
 */

import { wardenService } from '../services/warden.service.js';

/**
 * Get warden profile
 * @route GET /api/wardens/profile
 */
export const getWardenProfile = async (req, res) => {
  try {
    const result = await wardenService.getWardenProfile(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching warden profile:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a new warden
 * @route POST /api/wardens
 */
export const createWarden = async (req, res) => {
  try {
    const result = await wardenService.createWarden(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error creating warden:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all wardens
 * @route GET /api/wardens
 */
export const getAllWardens = async (req, res) => {
  try {
    const result = await wardenService.getAllWardens();
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting all wardens:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update warden
 * @route PUT /api/wardens/:id
 */
export const updateWarden = async (req, res) => {
  try {
    const result = await wardenService.updateWarden(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error updating warden:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid Warden ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete warden
 * @route DELETE /api/wardens/:id
 */
export const deleteWarden = async (req, res) => {
  try {
    const result = await wardenService.deleteWarden(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Set active hostel for warden
 * @route POST /api/wardens/active-hostel
 */
export const setActiveHostel = async (req, res) => {
  try {
    const result = await wardenService.setActiveHostel(req.user._id, req.body.hostelId, req.session);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error setting active hostel:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid hostel ID format' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
