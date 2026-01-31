/**
 * @fileoverview Grievance Controller
 * @description HTTP request handlers for grievance endpoints
 * @module apps/student-affairs/modules/grievance/controller
 */

import { asyncHandler, sendRawResponse } from '../../../../utils/controllerHelpers.js';
import { grievanceService } from './grievance.service.js';

// ═══════════════════════════════════════════════════════════════════════════════
// CREATE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Create new grievance
 * @route   POST /api/v1/student-affairs/grievances
 * @access  Private (Student)
 */
export const createGrievance = asyncHandler(async (req, res) => {
  const result = await grievanceService.createGrievance(req.body, req.user);
  sendRawResponse(res, result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// READ HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Get all grievances (filtered by role)
 * @route   GET /api/v1/student-affairs/grievances
 * @access  Private
 */
export const getGrievances = asyncHandler(async (req, res) => {
  const result = await grievanceService.getGrievances(req.query, req.user);
  sendRawResponse(res, result);
});

/**
 * @desc    Get single grievance by ID
 * @route   GET /api/v1/student-affairs/grievances/:id
 * @access  Private
 */
export const getGrievanceById = asyncHandler(async (req, res) => {
  const result = await grievanceService.getGrievanceById(req.params.id, req.user);
  sendRawResponse(res, result);
});

/**
 * @desc    Get grievance statistics
 * @route   GET /api/v1/student-affairs/grievances/stats
 * @access  Private (Admin, Dean)
 */
export const getStatistics = asyncHandler(async (req, res) => {
  const result = await grievanceService.getStatistics(req.user);
  sendRawResponse(res, result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// UPDATE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Update grievance status
 * @route   PATCH /api/v1/student-affairs/grievances/:id/status
 * @access  Private (Admin, Staff)
 */
export const updateStatus = asyncHandler(async (req, res) => {
  const result = await grievanceService.updateStatus(
    req.params.id,
    req.body,
    req.user
  );
  sendRawResponse(res, result);
});

/**
 * @desc    Assign grievance to staff member
 * @route   PATCH /api/v1/student-affairs/grievances/:id/assign
 * @access  Private (Admin, Dean)
 */
export const assignGrievance = asyncHandler(async (req, res) => {
  const result = await grievanceService.assignGrievance(
    req.params.id,
    req.body.assigneeId,
    req.user
  );
  sendRawResponse(res, result);
});

/**
 * @desc    Add comment to grievance
 * @route   POST /api/v1/student-affairs/grievances/:id/comments
 * @access  Private
 */
export const addComment = asyncHandler(async (req, res) => {
  const result = await grievanceService.addComment(
    req.params.id,
    req.body,
    req.user
  );
  sendRawResponse(res, result);
});

/**
 * @desc    Resolve grievance
 * @route   PATCH /api/v1/student-affairs/grievances/:id/resolve
 * @access  Private (Staff, Admin)
 */
export const resolveGrievance = asyncHandler(async (req, res) => {
  const result = await grievanceService.resolveGrievance(
    req.params.id,
    req.body,
    req.user
  );
  sendRawResponse(res, result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @desc    Delete grievance (pending only)
 * @route   DELETE /api/v1/student-affairs/grievances/:id
 * @access  Private (Student - own, Admin)
 */
export const deleteGrievance = asyncHandler(async (req, res) => {
  const result = await grievanceService.deleteGrievance(req.params.id, req.user);
  sendRawResponse(res, result);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  createGrievance,
  getGrievances,
  getGrievanceById,
  getStatistics,
  updateStatus,
  assignGrievance,
  addComment,
  resolveGrievance,
  deleteGrievance,
};
