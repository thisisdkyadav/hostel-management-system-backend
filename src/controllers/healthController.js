/**
 * Health Controller
 * Handles HTTP requests for health operations.
 * Business logic delegated to HealthService.
 * 
 * @module controllers/health
 */

import { healthService } from '../services/health.service.js';

/**
 * Get health record for a user
 * @route GET /api/health/:userId
 */
export const getHealth = async (req, res) => {
  try {
    const result = await healthService.getHealth(req.params.userId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update health record for a user
 * @route PUT /api/health/:userId
 */
export const updateHealth = async (req, res) => {
  try {
    const result = await healthService.updateHealth(req.params.userId, req.body);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Bulk update student health records
 * @route POST /api/health/bulk
 */
export const updateBulkStudentHealth = async (req, res) => {
  try {
    const result = await healthService.updateBulkStudentHealth(req.body.studentsData);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// health deletion is not allowed

// insurance claim controller

/**
 * Create insurance claim
 * @route POST /api/health/insurance-claims
 */
export const createInsuranceClaim = async (req, res) => {
  try {
    const result = await healthService.createInsuranceClaim(req.body);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get insurance claims for a user
 * @route GET /api/health/insurance-claims/:userId
 */
export const getInsuranceClaims = async (req, res) => {
  try {
    const result = await healthService.getInsuranceClaims(req.params.userId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update insurance claim
 * @route PUT /api/health/insurance-claims/:id
 */
export const updateInsuranceClaim = async (req, res) => {
  try {
    const result = await healthService.updateInsuranceClaim(req.params.id, req.body);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete insurance claim
 * @route DELETE /api/health/insurance-claims/:id
 */
export const deleteInsuranceClaim = async (req, res) => {
  try {
    const result = await healthService.deleteInsuranceClaim(req.params.id);
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
