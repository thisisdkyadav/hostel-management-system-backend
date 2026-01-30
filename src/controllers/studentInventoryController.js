/**
 * Student Inventory Controller
 * Handles HTTP requests and responses for student inventory operations.
 * Business logic is delegated to studentInventoryService.
 * 
 * @module controllers/studentInventoryController
 */

import { studentInventoryService } from '../services/studentInventory.service.js';

// @desc    Assign inventory items to a student
// @route   POST /api/inventory/student
// @access  Private/Warden/Admin
export const assignInventoryToStudent = async (req, res) => {
  try {
    const result = await studentInventoryService.assignInventoryToStudent(req.body, req.user);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get inventory items for a specific student
// @route   GET /api/inventory/student/:studentProfileId
// @access  Private
export const getStudentInventory = async (req, res) => {
  try {
    const result = await studentInventoryService.getStudentInventory(req.params.studentProfileId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all student inventory items with filtering
// @route   GET /api/inventory/student
// @access  Private/Admin/Warden
export const getAllStudentInventory = async (req, res) => {
  try {
    const result = await studentInventoryService.getAllStudentInventory(req.query, req.user);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Return inventory items from a student
// @route   PUT /api/inventory/student/:id/return
// @access  Private/Warden/Admin
export const returnStudentInventory = async (req, res) => {
  try {
    const result = await studentInventoryService.returnStudentInventory(
      req.params.id,
      req.body,
      req.user
    );
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Mark inventory item as damaged or lost
// @route   PUT /api/inventory/student/:id/status
// @access  Private/Warden/Admin
export const updateInventoryStatus = async (req, res) => {
  try {
    const result = await studentInventoryService.updateInventoryStatus(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get inventory summary by student
// @route   GET /api/inventory/student/summary/student
// @access  Private/Admin/Warden
export const getInventorySummaryByStudent = async (req, res) => {
  try {
    const result = await studentInventoryService.getInventorySummaryByStudent(req.query.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get inventory summary by item type
// @route   GET /api/inventory/student/summary/item
// @access  Private/Admin/Warden
export const getInventorySummaryByItemType = async (req, res) => {
  try {
    const result = await studentInventoryService.getInventorySummaryByItemType(req.query.hostelId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
