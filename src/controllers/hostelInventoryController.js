/**
 * Hostel Inventory Controller
 * Handles HTTP requests for hostel inventory operations.
 * Business logic delegated to HostelInventoryService.
 * 
 * @module controllers/hostelInventory
 */

import { hostelInventoryService } from '../services/hostelInventory.service.js';

/**
 * Assign inventory items to a hostel
 * @route POST /api/inventory/hostel
 */
export const assignInventoryToHostel = async (req, res) => {
  try {
    const result = await hostelInventoryService.assignInventoryToHostel(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error assigning inventory to hostel:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * Get inventory items for a specific hostel
 * @route GET /api/inventory/hostel/:hostelId
 */
export const getHostelInventory = async (req, res) => {
  try {
    const result = await hostelInventoryService.getHostelInventory(req.params.hostelId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting hostel inventory:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * Get all hostel inventory items with pagination
 * @route GET /api/inventory/hostel
 */
export const getAllHostelInventory = async (req, res) => {
  try {
    const result = await hostelInventoryService.getAllHostelInventory(req.user, req.query);
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting all hostel inventory:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * Update hostel inventory allocation
 * @route PUT /api/inventory/hostel/:id
 */
export const updateHostelInventory = async (req, res) => {
  try {
    const result = await hostelInventoryService.updateHostelInventory(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error updating hostel inventory:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * Delete hostel inventory allocation
 * @route DELETE /api/inventory/hostel/:id
 */
export const deleteHostelInventory = async (req, res) => {
  try {
    const result = await hostelInventoryService.deleteHostelInventory(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error deleting hostel inventory:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}

/**
 * Get inventory summary by hostel
 * @route GET /api/inventory/hostel/summary
 */
export const getInventorySummaryByHostel = async (req, res) => {
  try {
    const result = await hostelInventoryService.getInventorySummaryByHostel();
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error getting inventory summary:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
}
