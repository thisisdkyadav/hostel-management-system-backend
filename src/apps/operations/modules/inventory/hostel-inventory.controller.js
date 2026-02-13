/**
 * Hostel Inventory Controller
 * Handles HTTP requests for hostel inventory operations.
 * Business logic delegated to HostelInventoryService.
 * 
 * @module apps/operations/modules/inventory/hostel-inventory.controller
 */

import { hostelInventoryService } from './hostel-inventory.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Assign inventory items to a hostel
 * @route POST /api/inventory/hostel
 */
export const assignInventoryToHostel = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.assignInventoryToHostel(req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
})

/**
 * Get inventory items for a specific hostel
 * @route GET /api/inventory/hostel/:hostelId
 */
export const getHostelInventory = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.getHostelInventory(req.params.hostelId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
})

/**
 * Get all hostel inventory items with pagination
 * @route GET /api/inventory/hostel
 */
export const getAllHostelInventory = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.getAllHostelInventory(req.user, req.query);
  
  res.status(result.statusCode).json(result.data);
})

/**
 * Update hostel inventory allocation
 * @route PUT /api/inventory/hostel/:id
 */
export const updateHostelInventory = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.updateHostelInventory(req.params.id, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
})

/**
 * Delete hostel inventory allocation
 * @route DELETE /api/inventory/hostel/:id
 */
export const deleteHostelInventory = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.deleteHostelInventory(req.params.id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
})

/**
 * Get inventory summary by hostel
 * @route GET /api/inventory/hostel/summary
 */
export const getInventorySummaryByHostel = asyncHandler(async (req, res) => {
  const result = await hostelInventoryService.getInventorySummaryByHostel();
  
  res.status(result.statusCode).json(result.data);
})
