/**
 * Complaint Controller
 * Handles HTTP layer for complaint operations
 * 
 * Business logic delegated to complaintService
 * 
 * @module controllers/complaintController
 */

import { complaintService } from '../services/complaint.service.js';
import { asyncHandler } from '../../../utils/index.js';

/**
 * Create a new complaint
 * POST /api/complaint
 */
export const createComplaint = asyncHandler(async (req, res) => {
  const user = req.user;
  const { userId, title, description, location, category, attachments } = req.body;

  // Get allocation details via service
  const allocationResult = await complaintService.getAllocationDetails(user, userId);
  
  if (!allocationResult.success) {
    return res.status(allocationResult.statusCode).json({ message: allocationResult.error });
  }

  // Create complaint via service
  await complaintService.createComplaint({
    userId,
    title,
    description,
    location,
    category,
    attachments,
    allocationDetails: allocationResult.allocationDetails,
  });

  res.status(201).json({ message: 'Complaint created successfully' });
});

/**
 * Get all complaints with filters
 * GET /api/complaint/all
 */
export const getAllComplaints = asyncHandler(async (req, res) => {
  const user = req.user;
  const filters = req.query;

  const result = await complaintService.getAllComplaints(user, filters);

  res.status(200).json({
    data: result.complaints || [],
    meta: {
      total: result.total,
      currentPage: result.page,
      totalPages: result.totalPages,
    },
    message: 'Complaints fetched successfully',
    status: 'success',
  });
});

/**
 * Get complaint by ID
 * GET /api/complaint/:id
 */
export const getComplaintById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const user = req.user;

  const result = await complaintService.getComplaintById(id, user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.status(200).json({ message: 'Complaint fetched successfully', data: result.complaint });
});

/**
 * Update complaint status (legacy endpoint)
 * PUT /api/complaint/update-status/:id
 */
export const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, assignedTo, resolutionNotes, feedback, feedbackRating } = req.body;

  const result = await complaintService.updateComplaintStatus(id, {
    status,
    assignedTo,
    resolutionNotes,
    feedback,
    feedbackRating,
  });

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.status(200).json({ message: 'Complaint updated successfully', data: result.complaint });
});

/**
 * Get complaint statistics
 * GET /api/complaint/stats
 */
export const getStats = asyncHandler(async (req, res) => {
  const user = req.user;
  const { hostelId } = req.query;

  const stats = await complaintService.getStats(user, hostelId);

  res.status(200).json(stats);
});

/**
 * Get complaints for a specific student
 * GET /api/complaint/student/complaints/:userId
 */
export const getStudentComplaints = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  const result = await complaintService.getStudentComplaints(userId, { page, limit });

  res.status(200).json({
    data: result.complaints || [],
    meta: {
      total: result.total,
      currentPage: result.page,
      totalPages: result.totalPages,
    },
    message: 'Student complaints fetched successfully',
  });
});

/**
 * Update complaint status
 * PUT /api/complaint/:complaintId/status
 */
export const complaintStatusUpdate = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { status } = req.body;
  const user = req.user;

  const result = await complaintService.updateStatus(complaintId, status, user._id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.status(200).json({ message: 'Complaint status updated successfully', data: result.complaint });
});

/**
 * Update resolution notes
 * PUT /api/complaint/:complaintId/resolution-notes
 */
export const updateComplaintResolutionNotes = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { resolutionNotes } = req.body;

  const result = await complaintService.updateResolutionNotes(complaintId, resolutionNotes);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.status(200).json({ message: 'Complaint resolution notes updated successfully', data: result.complaint });
});

/**
 * Update complaint feedback
 * POST /api/complaint/:complaintId/feedback
 */
export const updateComplaintFeedback = asyncHandler(async (req, res) => {
  const user = req.user;
  const { complaintId } = req.params;
  const { feedback, feedbackRating, satisfactionStatus } = req.body;

  const result = await complaintService.updateFeedback(complaintId, user._id, {
    feedback,
    feedbackRating,
    satisfactionStatus,
  });

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.status(200).json({ message: 'Complaint feedback updated successfully', data: result.complaint });
});
