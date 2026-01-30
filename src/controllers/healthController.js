/**
 * Health Controller
 * Handles HTTP requests for health operations.
 * Business logic delegated to HealthService.
 * 
 * @module controllers/health
 */

import { healthService } from '../services/health.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get health record for a user
 * @route GET /api/health/:userId
 */
export const getHealth = asyncHandler(async (req, res) => {
  const result = await healthService.getHealth(req.params.userId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Update health record for a user
 * @route PUT /api/health/:userId
 */
export const updateHealth = asyncHandler(async (req, res) => {
  const result = await healthService.updateHealth(req.params.userId, req.body);
  res.status(result.statusCode).json(result.data);
});

/**
 * Bulk update student health records
 * @route POST /api/health/bulk
 */
export const updateBulkStudentHealth = asyncHandler(async (req, res) => {
  const result = await healthService.updateBulkStudentHealth(req.body.studentsData);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

// health deletion is not allowed

// insurance claim controller

/**
 * Create insurance claim
 * @route POST /api/health/insurance-claims
 */
export const createInsuranceClaim = asyncHandler(async (req, res) => {
  const result = await healthService.createInsuranceClaim(req.body);
  res.status(result.statusCode).json(result.data);
});

/**
 * Get insurance claims for a user
 * @route GET /api/health/insurance-claims/:userId
 */
export const getInsuranceClaims = asyncHandler(async (req, res) => {
  const result = await healthService.getInsuranceClaims(req.params.userId);
  res.status(result.statusCode).json(result.data);
});

/**
 * Update insurance claim
 * @route PUT /api/health/insurance-claims/:id
 */
export const updateInsuranceClaim = asyncHandler(async (req, res) => {
  const result = await healthService.updateInsuranceClaim(req.params.id, req.body);
  res.status(result.statusCode).json(result.data);
});

/**
 * Delete insurance claim
 * @route DELETE /api/health/insurance-claims/:id
 */
export const deleteInsuranceClaim = asyncHandler(async (req, res) => {
  const result = await healthService.deleteInsuranceClaim(req.params.id);
  res.status(result.statusCode).json({ message: result.message });
});
