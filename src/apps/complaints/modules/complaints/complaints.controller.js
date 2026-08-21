/**
 * Complaint Controller
 * HTTP layer for complaint operations. Business logic is delegated to
 * complaintService; every handler returns a ServiceResponse and the
 * `handler()` adapter maps it to the standard response envelope.
 *
 * @module controllers/complaintController
 */

import { complaintService } from './complaints.service.js';
import { handler } from '../../../../lib/api-kit/index.js';

/**
 * Create a new complaint
 * POST /api/complaint
 */
export const createComplaint = handler(async (req) => {
  const user = req.user;
  const { userId, title, description, location, category, attachments } = req.body;

  // Students always own their own complaints — never trust body.userId.
  const ownerUserId = user.role === 'Student' ? user._id : userId;

  const allocationResult = await complaintService.getAllocationDetails(user, ownerUserId);
  if (!allocationResult.success) return allocationResult;

  return complaintService.createComplaint({
    userId: ownerUserId,
    title,
    description,
    location,
    category,
    attachments,
    allocationDetails: allocationResult.data ?? null,
    requesterUser: user,
  });
});

/**
 * Get all complaints with filters
 * GET /api/complaint/all
 */
export const getAllComplaints = handler((req) =>
  complaintService.getAllComplaints(req.user, req.query)
);

/**
 * Get complaint by ID
 * GET /api/complaint/:id
 */
export const getComplaintById = handler((req) =>
  complaintService.getComplaintById(req.params.id, req.user)
);

/**
 * Update complaint status (legacy endpoint)
 * PUT /api/complaint/update-status/:id
 */
export const updateComplaintStatus = handler((req) =>
  complaintService.updateComplaintStatus(
    req.params.id,
    {
      status: req.body.status,
      assignedTo: req.body.assignedTo,
      resolutionNotes: req.body.resolutionNotes,
      feedback: req.body.feedback,
      feedbackRating: req.body.feedbackRating,
    },
    req.user
  )
);

/**
 * Get complaint statistics
 * GET /api/complaint/stats
 */
export const getStats = handler((req) =>
  complaintService.getStats(req.user, req.query.hostelId)
);

/**
 * Get complaints for a specific student
 * GET /api/complaint/student/complaints/:userId
 */
export const getStudentComplaints = handler((req) =>
  complaintService.getStudentComplaints(
    req.params.userId,
    { page: req.query.page ?? 1, limit: req.query.limit ?? 10 },
    req.user
  )
);

/**
 * Update complaint status
 * PUT /api/complaint/:complaintId/status
 */
export const complaintStatusUpdate = handler((req) =>
  complaintService.updateStatus(req.params.complaintId, req.body.status, req.user)
);

/**
 * Update resolution notes
 * PUT /api/complaint/:complaintId/resolution-notes
 */
export const updateComplaintResolutionNotes = handler((req) =>
  complaintService.updateResolutionNotes(req.params.complaintId, req.body.resolutionNotes, req.user)
);

/**
 * Update complaint category
 * PUT /api/complaint/:complaintId/category
 */
export const updateComplaintCategory = handler((req) =>
  complaintService.updateCategory(req.params.complaintId, req.body.category, req.user)
);

/**
 * Update complaint feedback
 * POST /api/complaint/:complaintId/feedback
 */
export const updateComplaintFeedback = handler((req) =>
  complaintService.updateFeedback(req.params.complaintId, req.user._id, {
    feedback: req.body.feedback,
    feedbackRating: req.body.feedbackRating,
    satisfactionStatus: req.body.satisfactionStatus,
  })
);

/**
 * Get complaint by feedback token (PUBLIC - no auth required)
 * GET /api/complaint/feedback/:token
 */
export const getComplaintByToken = handler((req) =>
  complaintService.getComplaintByToken(req.params.token)
);

/**
 * Submit feedback using token (PUBLIC - no auth required)
 * POST /api/complaint/feedback/:token
 */
export const submitFeedbackByToken = handler((req) =>
  complaintService.submitFeedbackByToken(req.params.token, {
    feedback: req.body.feedback,
    feedbackRating: req.body.feedbackRating,
    satisfactionStatus: req.body.satisfactionStatus,
  })
);
