/**
 * Complaint Service
 * Handles complaint management with BaseService pattern
 * @module services/complaint.service
 */

import { BaseService, success, notFound, forbidden, paginated, badRequest } from '../../../../services/base/index.js';
import { Complaint, FeedbackToken } from '../../../../models/index.js';
import { RoomAllocation } from '../../../../models/index.js';
import { emailService } from '../../../../services/email/email.service.js';
import mongoose from 'mongoose';
import env from '../../../../config/env.config.js';
import { AUTHZ_MODES, getConstraintValue } from '../../../../core/authz/index.js';

const COMPLAINT_SCOPE_HOSTELS_CONSTRAINT = 'constraint.complaints.scope.hostelIds';

const toObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value?.toString) return value.toString();
  return null;
};

const toStringArray = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
};

const isAuthzEnforceMode = () => {
  const mode = String(env.AUTHZ_MODE || AUTHZ_MODES.OBSERVE).trim().toLowerCase();
  return mode === AUTHZ_MODES.ENFORCE;
};

/**
 * Helper function to format complaint for response
 */
function formatComplaint(complaint) {
  let roomNumber = '';
  if (complaint.unitId && complaint.roomId) {
    roomNumber = `${complaint.unitId.unitNumber}-${complaint.roomId.roomNumber}`;
  } else if (complaint.roomId) {
    roomNumber = complaint.roomId.roomNumber;
  }

  return {
    id: complaint._id,
    title: complaint.title,
    description: complaint.description,
    status: complaint.status,
    category: complaint.category,
    hostel: complaint.hostelId?.name || null,
    roomNumber,
    location: complaint.location,
    reportedBy: {
      id: complaint.userId._id,
      email: complaint.userId.email,
      name: complaint.userId.name,
      profileImage: complaint.userId.profileImage || null,
      phone: complaint.userId.phone || null,
      role: complaint.userId.role
    },
    assignedTo: complaint.assignedTo ? {
      id: complaint.assignedTo._id,
      email: complaint.assignedTo.email,
      name: complaint.assignedTo.name,
      profileImage: complaint.assignedTo.profileImage || null,
      phone: complaint.assignedTo.phone || null
    } : null,
    resolvedBy: complaint.resolvedBy ? {
      id: complaint.resolvedBy._id,
      email: complaint.resolvedBy.email,
      name: complaint.resolvedBy.name,
      profileImage: complaint.resolvedBy.profileImage || null,
      phone: complaint.resolvedBy.phone || null
    } : null,
    resolutionNotes: complaint.resolutionNotes || '',
    images: complaint.attachments || [],
    createdDate: complaint.createdAt.toISOString(),
    lastUpdated: complaint.updatedAt.toISOString(),
    feedback: complaint.feedback || '',
    feedbackRating: complaint.feedbackRating || null,
    satisfactionStatus: complaint.satisfactionStatus || null,
    resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null
  };
}

/**
 * Format complaint for student complaints endpoint
 */
function formatStudentComplaint(complaint) {
  let roomNumber = '';
  if (complaint.unitId && complaint.roomId) {
    roomNumber = `${complaint.unitId.unitNumber}-${complaint.roomId.roomNumber}`;
  } else if (complaint.roomId) {
    roomNumber = complaint.roomId.roomNumber;
  } else {
    roomNumber = 'N/A';
  }

  return {
    id: complaint._id,
    title: complaint.title,
    description: complaint.description,
    status: complaint.status,
    category: complaint.category,
    hostel: complaint.hostelId?.name || 'N/A',
    roomNumber,
    location: complaint.location,
    reportedBy: {
      id: complaint.userId._id,
      email: complaint.userId.email,
      name: complaint.userId.name,
      profileImage: complaint.userId.profileImage || null,
      phone: complaint.userId.phone || null
    },
    assignedTo: complaint.assignedTo ? {
      id: complaint.assignedTo._id,
      email: complaint.assignedTo.email,
      name: complaint.assignedTo.name,
      profileImage: complaint.assignedTo.profileImage || null,
      phone: complaint.assignedTo.phone || null
    } : null,
    resolvedBy: complaint.resolvedBy ? {
      id: complaint.resolvedBy._id,
      email: complaint.resolvedBy.email,
      name: complaint.resolvedBy.name,
      profileImage: complaint.resolvedBy.profileImage || null,
      phone: complaint.resolvedBy.phone || null
    } : null,
    resolutionNotes: complaint.resolutionNotes || '',
    images: complaint.attachments || [],
    createdDate: complaint.createdAt.toISOString(),
    lastUpdated: complaint.updatedAt.toISOString(),
    feedback: complaint.feedback || '',
    feedbackRating: complaint.feedbackRating || null,
    satisfactionStatus: complaint.satisfactionStatus || null,
    resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null
  };
}

class ComplaintService extends BaseService {
  constructor() {
    super(Complaint, 'Complaint');
  }

  getComplaintScopeContext(user) {
    const effectiveAuthz = user?.authz?.effective || null;
    const enforceConstraints = isAuthzEnforceMode() && Boolean(effectiveAuthz);

    const ownHostelId = toObjectIdString(user?.hostel?._id || user?.hostel);
    const configuredHostelIds = toStringArray(
      getConstraintValue(effectiveAuthz, COMPLAINT_SCOPE_HOSTELS_CONSTRAINT, [])
    )
      .map(toObjectIdString)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id));

    let scopedHostelIds = ownHostelId ? new Set([ownHostelId]) : null;
    if (enforceConstraints && configuredHostelIds.length > 0) {
      if (scopedHostelIds) {
        scopedHostelIds = new Set(
          [...scopedHostelIds].filter((hostelId) => configuredHostelIds.includes(hostelId))
        );
      } else {
        scopedHostelIds = new Set(configuredHostelIds);
      }
    }

    return { enforceConstraints, scopedHostelIds };
  }

  isHostelAllowed(hostelId, scopeContext) {
    const scopedHostelIds = scopeContext?.scopedHostelIds;
    if (!scopedHostelIds) return true;
    if (!hostelId) return false;
    return scopedHostelIds.has(toObjectIdString(hostelId));
  }

  buildNoResultPagination(page, limit) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    return paginated([], { page: pageNum, limit: limitNum, total: 0 });
  }

  /**
   * Get room allocation details for a user
   */
  async getAllocationDetails(user, userId) {
    if (['Student'].includes(user.role)) {
      const allocationDetails = await RoomAllocation.findOne({ userId });
      if (!allocationDetails) {
        return notFound('Room allocation not found');
      }
      return success(allocationDetails);
    } else if (user.hostel) {
      return success({ hostelId: user.hostel._id });
    }
    return success(null);
  }

  /**
   * Create a new complaint
   */
  async createComplaint({
    userId,
    title,
    description,
    location,
    category,
    attachments,
    allocationDetails,
    requesterUser,
  }) {
    const scopeContext = this.getComplaintScopeContext(requesterUser);
    const complaintHostelId = toObjectIdString(allocationDetails?.hostelId);
    if (scopeContext.enforceConstraints && !this.isHostelAllowed(complaintHostelId, scopeContext)) {
      return forbidden('You are not authorized to create complaints for this hostel');
    }

    const complaint = await this.model.create({
      userId,
      title,
      description,
      location,
      category,
      hostelId: allocationDetails?.hostelId,
      unitId: allocationDetails?.unitId,
      roomId: allocationDetails?.roomId,
      attachments
    });
    return success(complaint);
  }

  /**
   * Build query for fetching complaints based on user role and filters
   */
  buildComplaintsQuery(user, filters) {
    const { category, status, hostelId, startDate, endDate, feedbackRating, satisfactionStatus } = filters;
    const query = {};
    const scopeContext = this.getComplaintScopeContext(user);

    if (['Student'].includes(user.role)) {
      query.userId = user._id;
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    } else if (hostelId && ['Admin', 'Maintenance Staff'].includes(user.role)) {
      query.hostelId = hostelId;
    }

    if (category) query.category = category;
    if (status) query.status = status;
    if (feedbackRating) query.feedbackRating = Number(feedbackRating);
    if (satisfactionStatus) query.satisfactionStatus = satisfactionStatus;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        query.createdAt.$lte = endDateObj;
      }
    }

    if (scopeContext.scopedHostelIds) {
      if (scopeContext.scopedHostelIds.size === 0) {
        return { query, blockedByScope: true };
      }

      if (query.hostelId) {
        const requestedHostelId = toObjectIdString(query.hostelId);
        if (!scopeContext.scopedHostelIds.has(requestedHostelId)) {
          return { query, blockedByScope: true };
        }
        query.hostelId = new mongoose.Types.ObjectId(requestedHostelId);
      } else {
        query.hostelId = {
          $in: [...scopeContext.scopedHostelIds].map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    return { query, blockedByScope: false };
  }

  /**
   * Get all complaints with pagination
   */
  async getAllComplaints(user, filters) {
    const { page = 1, limit = 10 } = filters;
    const { query, blockedByScope } = this.buildComplaintsQuery(user, filters);
    if (blockedByScope) {
      return this.buildNoResultPagination(page, limit);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const [totalCount, complaints] = await Promise.all([
      this.model.countDocuments(query),
      this.model.find(query)
        .populate('userId', 'name email phone profileImage role')
        .populate('hostelId', 'name')
        .populate('unitId', 'unitNumber')
        .populate('roomId', 'roomNumber')
        .populate('assignedTo', 'name email phone profileImage')
        .populate('resolvedBy', 'name email phone profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    return paginated(complaints.map(formatComplaint), { page: parseInt(page), limit: limitNum, total: totalCount });
  }

  /**
   * Get complaint by ID
   */
  async getComplaintById(complaintId, user) {
    const scopeContext = this.getComplaintScopeContext(user);
    const complaint = await this.model.findById(complaintId)
      .populate('userId', 'name email phone profileImage role')
      .populate('hostelId', 'name')
      .populate('unitId', 'unitNumber')
      .populate('roomId', 'roomNumber')
      .populate('assignedTo', 'name email phone profileImage')
      .populate('resolvedBy', 'name email phone profileImage');

    if (!complaint) {
      return notFound('Complaint not found');
    }

    // Check authorization
    if (user.hostel && !['Admin', 'Maintenance Staff'].includes(user.role) &&
        complaint.hostelId.toString() !== user.hostel._id.toString()) {
      return forbidden('You are not authorized to access this complaint');
    }

    if (['Student'].includes(user.role) && complaint.userId.toString() !== user._id.toString()) {
      return forbidden('You are not authorized to access this complaint');
    }

    if (scopeContext.enforceConstraints && !this.isHostelAllowed(complaint.hostelId?._id, scopeContext)) {
      return forbidden('You are not authorized to access this complaint');
    }

    return success(complaint);
  }

  /**
   * Update complaint status (legacy method)
   */
  async updateComplaintStatus(complaintId, updateData, user) {
    const { status, assignedTo, resolutionNotes, feedback, feedbackRating } = updateData;

    const complaint = await this.model.findById(complaintId);

    if (!complaint) {
      return notFound('Complaint not found');
    }

    const scopeContext = this.getComplaintScopeContext(user);
    if (scopeContext.enforceConstraints && !this.isHostelAllowed(complaint.hostelId, scopeContext)) {
      return forbidden('You are not authorized to update this complaint');
    }

    complaint.status = status;
    complaint.assignedTo = assignedTo;
    complaint.resolutionNotes = resolutionNotes;
    complaint.feedback = feedback;
    complaint.feedbackRating = feedbackRating;
    complaint.resolutionDate = status === 'Resolved' ? new Date() : null;
    await complaint.save();

    return success(complaint);
  }

  /**
   * Get complaint statistics
   */
  async getStats(user, hostelId) {
    const query = {};
    const scopeContext = this.getComplaintScopeContext(user);

    if (['Student'].includes(user.role)) {
      query.userId = user._id;
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    } else if (hostelId && ['Admin', 'Maintenance Staff'].includes(user.role)) {
      query.hostelId = hostelId;
    }

    if (scopeContext.scopedHostelIds) {
      if (scopeContext.scopedHostelIds.size === 0) {
        return success({ total: 0, pending: 0, inProgress: 0, resolved: 0, forwardedToIDO: 0 });
      }

      if (query.hostelId) {
        const requestedHostelId = toObjectIdString(query.hostelId);
        if (!scopeContext.scopedHostelIds.has(requestedHostelId)) {
          return success({ total: 0, pending: 0, inProgress: 0, resolved: 0, forwardedToIDO: 0 });
        }
        query.hostelId = new mongoose.Types.ObjectId(requestedHostelId);
      } else {
        query.hostelId = {
          $in: [...scopeContext.scopedHostelIds].map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    const [total, pending, inProgress, resolved, forwardedToIDO] = await Promise.all([
      this.model.countDocuments(query),
      this.model.countDocuments({ ...query, status: 'Pending' }),
      this.model.countDocuments({ ...query, status: 'In Progress' }),
      this.model.countDocuments({ ...query, status: 'Resolved' }),
      this.model.countDocuments({ ...query, status: 'Forwarded to IDO' })
    ]);

    return success({ total, pending, inProgress, resolved, forwardedToIDO });
  }

  /**
   * Get complaints for a specific student
   */
  async getStudentComplaints(userId, { page = 1, limit = 10 }, requesterUser) {
    const scopeContext = this.getComplaintScopeContext(requesterUser);
    const query = { userId };
    if (scopeContext.scopedHostelIds) {
      if (scopeContext.scopedHostelIds.size === 0) {
        return this.buildNoResultPagination(page, limit);
      }

      query.hostelId = {
        $in: [...scopeContext.scopedHostelIds].map((id) => new mongoose.Types.ObjectId(id)),
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const [totalCount, complaints] = await Promise.all([
      this.model.countDocuments(query),
      this.model.find(query)
        .populate('userId', 'name email phone profileImage role')
        .populate('hostelId', 'name')
        .populate('unitId', 'unitNumber')
        .populate('roomId', 'roomNumber')
        .populate('assignedTo', 'name email phone profileImage')
        .populate('resolvedBy', 'name email phone profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    return paginated(complaints.map(formatStudentComplaint), { page: parseInt(page), limit: limitNum, total: totalCount });
  }

  /**
   * Update complaint status (new method)
   * Sends feedback request email when status changes to Resolved
   */
  async updateStatus(complaintId, status, user) {
    const updateData = status === 'Resolved'
      ? { status, resolvedBy: user._id, resolutionDate: new Date() }
      : { status };

    const complaint = await this.model.findById(complaintId).populate('userId', 'name email');

    if (!complaint) {
      return notFound('Complaint not found');
    }

    const scopeContext = this.getComplaintScopeContext(user);
    if (scopeContext.enforceConstraints && !this.isHostelAllowed(complaint.hostelId, scopeContext)) {
      return forbidden('You are not authorized to update this complaint');
    }

    complaint.status = updateData.status;
    complaint.resolvedBy = updateData.resolvedBy || null;
    complaint.resolutionDate = updateData.resolutionDate || null;
    await complaint.save();

    // Send feedback email when complaint is resolved
    if (status === 'Resolved' && complaint.userId?.email) {
      try {
        // Create feedback token
        const feedbackToken = await FeedbackToken.create({
          complaintId: complaint._id,
        });

        // Send email asynchronously (don't block response)
        emailService.sendComplaintResolvedEmail({
          email: complaint.userId.email,
          studentName: complaint.userId.name,
          complaintTitle: complaint.title,
          complaintCategory: complaint.category,
          resolutionNotes: complaint.resolutionNotes,
          feedbackToken: feedbackToken.token,
        }).catch(err => {
          console.error('Failed to send complaint resolved email:', err);
        });
      } catch (err) {
        console.error('Failed to create feedback token:', err);
      }
    }

    return success(complaint);
  }

  /**
   * Update resolution notes
   */
  async updateResolutionNotes(complaintId, resolutionNotes, user) {
    const complaint = await this.model.findById(complaintId);

    if (!complaint) {
      return notFound('Complaint not found');
    }

    const scopeContext = this.getComplaintScopeContext(user);
    if (scopeContext.enforceConstraints && !this.isHostelAllowed(complaint.hostelId, scopeContext)) {
      return forbidden('You are not authorized to update this complaint');
    }

    complaint.resolutionNotes = resolutionNotes;
    await complaint.save();

    return success(complaint);
  }

  /**
   * Update complaint feedback
   */
  async updateFeedback(complaintId, userId, feedbackData) {
    const { feedback, feedbackRating, satisfactionStatus } = feedbackData;

    const existingComplaint = await this.model.findById(complaintId);
    if (!existingComplaint) {
      return notFound('Complaint not found');
    }

    if (existingComplaint.userId.toString() !== userId.toString()) {
      return forbidden('You are not authorized to update feedback for this complaint');
    }

    const complaint = await this.model.findByIdAndUpdate(
      complaintId,
      { feedback, feedbackRating, satisfactionStatus },
      { new: true }
    );

    return success(complaint);
  }

  /**
   * Get complaint by feedback token (public access)
   */
  async getComplaintByToken(token) {
    const feedbackToken = await FeedbackToken.findOne({ token });

    if (!feedbackToken) {
      return notFound('Invalid feedback link');
    }

    if (feedbackToken.expiresAt < new Date()) {
      return badRequest('This feedback link has expired');
    }

    if (feedbackToken.used) {
      return badRequest('Feedback has already been submitted for this complaint');
    }

    const complaint = await this.model.findById(feedbackToken.complaintId)
      .populate('userId', 'name email')
      .populate('hostelId', 'name')
      .populate('unitId', 'unitNumber')
      .populate('roomId', 'roomNumber')
      .populate('resolvedBy', 'name');

    if (!complaint) {
      return notFound('Complaint not found');
    }

    // Format for public view
    let roomNumber = '';
    if (complaint.unitId && complaint.roomId) {
      roomNumber = `${complaint.unitId.unitNumber}-${complaint.roomId.roomNumber}`;
    } else if (complaint.roomId) {
      roomNumber = complaint.roomId.roomNumber;
    }

    return success({
      id: complaint._id,
      title: complaint.title,
      description: complaint.description,
      status: complaint.status,
      category: complaint.category,
      hostel: complaint.hostelId?.name || null,
      roomNumber,
      location: complaint.location,
      resolutionNotes: complaint.resolutionNotes || '',
      resolutionDate: complaint.resolutionDate?.toISOString() || null,
      resolvedBy: complaint.resolvedBy?.name || null,
      createdDate: complaint.createdAt.toISOString(),
      studentName: complaint.userId?.name || 'Student',
    });
  }

  /**
   * Submit feedback using token (public access)
   */
  async submitFeedbackByToken(token, feedbackData) {
    const { feedback, feedbackRating, satisfactionStatus } = feedbackData;

    const feedbackToken = await FeedbackToken.findOne({ token });

    if (!feedbackToken) {
      return notFound('Invalid feedback link');
    }

    if (feedbackToken.expiresAt < new Date()) {
      return badRequest('This feedback link has expired');
    }

    if (feedbackToken.used) {
      return badRequest('Feedback has already been submitted for this complaint');
    }

    // Update complaint with feedback
    const complaint = await this.model.findByIdAndUpdate(
      feedbackToken.complaintId,
      { feedback, feedbackRating, satisfactionStatus },
      { new: true }
    );

    if (!complaint) {
      return notFound('Complaint not found');
    }

    // Mark token as used
    feedbackToken.used = true;
    await feedbackToken.save();

    return success({ message: 'Feedback submitted successfully' });
  }
}

export const complaintService = new ComplaintService();
export default complaintService;
