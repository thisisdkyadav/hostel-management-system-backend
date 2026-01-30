/**
 * Complaint Service
 * Contains business logic extracted from complaintController
 * 
 * IMPORTANT: All logic copied exactly from controller
 * Only HTTP-specific code (req, res) removed
 * 
 * @module services/complaint.service
 */

import Complaint from '../../models/Complaint.js';
import RoomAllocation from '../../models/RoomAllocation.js';

/**
 * Helper function to format complaint for response
 * @param {Object} complaint - Complaint document
 * @returns {Object} Formatted complaint
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
    hostel: complaint.hostelId ? complaint.hostelId.name : null,
    roomNumber: roomNumber,
    location: complaint.location,
    reportedBy: {
      id: complaint.userId._id,
      email: complaint.userId.email,
      name: complaint.userId.name,
      profileImage: complaint.userId.profileImage || null,
      phone: complaint.userId.phone || null,
      role: complaint.userId.role,
    },
    assignedTo: complaint.assignedTo
      ? {
          id: complaint.assignedTo._id,
          email: complaint.assignedTo.email,
          name: complaint.assignedTo.name,
          profileImage: complaint.assignedTo.profileImage || null,
          phone: complaint.assignedTo.phone || null,
        }
      : null,
    resolvedBy: complaint.resolvedBy
      ? {
          id: complaint.resolvedBy._id,
          email: complaint.resolvedBy.email,
          name: complaint.resolvedBy.name,
          profileImage: complaint.resolvedBy.profileImage || null,
          phone: complaint.resolvedBy.phone || null,
        }
      : null,
    resolutionNotes: complaint.resolutionNotes || '',
    images: complaint.attachments || [],
    createdDate: complaint.createdAt.toISOString(),
    lastUpdated: complaint.updatedAt.toISOString(),
    feedback: complaint.feedback || '',
    feedbackRating: complaint.feedbackRating || null,
    satisfactionStatus: complaint.satisfactionStatus || null,
    resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null,
  };
}

/**
 * Format complaint for student complaints endpoint (slightly different format)
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
    hostel: complaint.hostelId ? complaint.hostelId.name : 'N/A',
    roomNumber: roomNumber,
    location: complaint.location,
    reportedBy: {
      id: complaint.userId._id,
      email: complaint.userId.email,
      name: complaint.userId.name,
      profileImage: complaint.userId.profileImage || null,
      phone: complaint.userId.phone || null,
    },
    assignedTo: complaint.assignedTo
      ? {
          id: complaint.assignedTo._id,
          email: complaint.assignedTo.email,
          name: complaint.assignedTo.name,
          profileImage: complaint.assignedTo.profileImage || null,
          phone: complaint.assignedTo.phone || null,
        }
      : null,
    resolvedBy: complaint.resolvedBy
      ? {
          id: complaint.resolvedBy._id,
          email: complaint.resolvedBy.email,
          name: complaint.resolvedBy.name,
          profileImage: complaint.resolvedBy.profileImage || null,
          phone: complaint.resolvedBy.phone || null,
        }
      : null,
    resolutionNotes: complaint.resolutionNotes || '',
    images: complaint.attachments || [],
    createdDate: complaint.createdAt.toISOString(),
    lastUpdated: complaint.updatedAt.toISOString(),
    feedback: complaint.feedback || '',
    feedbackRating: complaint.feedbackRating || null,
    satisfactionStatus: complaint.satisfactionStatus || null,
    resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null,
  };
}

class ComplaintService {
  /**
   * Get room allocation details for a user
   * @param {Object} user - User object
   * @param {string} userId - User ID for complaint
   * @returns {Promise<{success: boolean, allocationDetails?: Object, error?: string, statusCode?: number}>}
   */
  async getAllocationDetails(user, userId) {
    const { role } = user;
    
    if (['Student'].includes(role)) {
      const allocationDetails = await RoomAllocation.findOne({ userId });
      if (!allocationDetails) {
        return { 
          success: false, 
          error: 'Room allocation not found', 
          statusCode: 404 
        };
      }
      return { success: true, allocationDetails };
    } else if (user.hostel) {
      return { 
        success: true, 
        allocationDetails: { hostelId: user.hostel._id } 
      };
    }
    
    return { success: true, allocationDetails: null };
  }

  /**
   * Create a new complaint
   * @param {Object} options - Complaint data
   * @returns {Promise<Object>} Created complaint
   */
  async createComplaint({ userId, title, description, location, category, attachments, allocationDetails }) {
    const newComplaint = new Complaint({
      userId,
      title,
      description,
      location,
      category,
      hostelId: allocationDetails?.hostelId,
      unitId: allocationDetails?.unitId,
      roomId: allocationDetails?.roomId,
      attachments,
    });

    await newComplaint.save();
    return newComplaint;
  }

  /**
   * Build query for fetching complaints based on user role and filters
   */
  buildComplaintsQuery(user, filters) {
    const { role } = user;
    const { category, status, hostelId, startDate, endDate, feedbackRating, satisfactionStatus } = filters;
    
    const query = {};

    if (['Student'].includes(role)) {
      query.userId = user._id;
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    } else if (hostelId && ['Admin', 'Maintenance Staff'].includes(role)) {
      query.hostelId = hostelId;
    }

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    if (feedbackRating) {
      query.feedbackRating = Number(feedbackRating);
    }

    if (satisfactionStatus) {
      query.satisfactionStatus = satisfactionStatus;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        query.createdAt.$lte = endDateObj;
      }
    }

    return query;
  }

  /**
   * Get all complaints with pagination
   * @param {Object} user - User object
   * @param {Object} filters - Query filters
   * @returns {Promise<{complaints: Array, total: number, page: number, totalPages: number}>}
   */
  async getAllComplaints(user, filters) {
    const { page = 1, limit = 10 } = filters;
    const query = this.buildComplaintsQuery(user, filters);

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const totalCount = await Complaint.countDocuments(query);

    const complaints = await Complaint.find(query)
      .populate('userId', 'name email phone profileImage role')
      .populate('hostelId', 'name')
      .populate('unitId', 'unitNumber')
      .populate('roomId', 'roomNumber')
      .populate('assignedTo', 'name email phone profileImage')
      .populate('resolvedBy', 'name email phone profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedComplaints = complaints.map(formatComplaint);

    return {
      complaints: formattedComplaints,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limitNum),
    };
  }

  /**
   * Get complaint by ID
   * @param {string} complaintId - Complaint ID
   * @param {Object} user - User object
   * @returns {Promise<{success: boolean, complaint?: Object, error?: string, statusCode?: number}>}
   */
  async getComplaintById(complaintId, user) {
    const complaint = await Complaint.findById(complaintId)
      .populate('userId', 'name email phone profileImage role')
      .populate('hostelId', 'name')
      .populate('unitId', 'unitNumber')
      .populate('roomId', 'roomNumber')
      .populate('assignedTo', 'name email phone profileImage')
      .populate('resolvedBy', 'name email phone profileImage');

    if (!complaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    // Check authorization
    if (user.hostel && !['Admin', 'Maintenance Staff'].includes(user.role) && 
        complaint.hostelId.toString() !== user.hostel._id.toString()) {
      return { 
        success: false, 
        error: 'You are not authorized to access this complaint', 
        statusCode: 403 
      };
    }

    if (['Student'].includes(user.role) && complaint.userId.toString() !== user._id.toString()) {
      return { 
        success: false, 
        error: 'You are not authorized to access this complaint', 
        statusCode: 403 
      };
    }

    return { success: true, complaint };
  }

  /**
   * Update complaint status (legacy method)
   * @param {string} complaintId - Complaint ID
   * @param {Object} updateData - Update data
   * @returns {Promise<{success: boolean, complaint?: Object, error?: string, statusCode?: number}>}
   */
  async updateComplaintStatus(complaintId, updateData) {
    const { status, assignedTo, resolutionNotes, feedback, feedbackRating } = updateData;

    const complaint = await Complaint.findByIdAndUpdate(
      complaintId,
      {
        status,
        assignedTo,
        resolutionNotes,
        feedback,
        feedbackRating,
        resolutionDate: status === 'Resolved' ? new Date() : null,
      },
      { new: true }
    );

    if (!complaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    return { success: true, complaint };
  }

  /**
   * Get complaint statistics
   * @param {Object} user - User object
   * @param {string} hostelId - Optional hostel ID filter
   * @returns {Promise<Object>} Stats object
   */
  async getStats(user, hostelId) {
    const { role } = user;
    const query = {};

    if (['Student'].includes(role)) {
      query.userId = user._id;
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    } else if (hostelId && ['Admin', 'Maintenance Staff'].includes(role)) {
      query.hostelId = hostelId;
    }

    const [total, pending, inProgress, resolved, forwardedToIDO] = await Promise.all([
      Complaint.countDocuments(query),
      Complaint.countDocuments({ ...query, status: 'Pending' }),
      Complaint.countDocuments({ ...query, status: 'In Progress' }),
      Complaint.countDocuments({ ...query, status: 'Resolved' }),
      Complaint.countDocuments({ ...query, status: 'Forwarded to IDO' }),
    ]);

    return { total, pending, inProgress, resolved, forwardedToIDO };
  }

  /**
   * Get complaints for a specific student
   * @param {string} userId - Student user ID
   * @param {Object} pagination - Pagination options
   * @returns {Promise<{complaints: Array, total: number, page: number, totalPages: number}>}
   */
  async getStudentComplaints(userId, { page = 1, limit = 10 }) {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const totalCount = await Complaint.countDocuments({ userId });

    const complaints = await Complaint.find({ userId })
      .populate('userId', 'name email phone profileImage role')
      .populate('hostelId', 'name')
      .populate('unitId', 'unitNumber')
      .populate('roomId', 'roomNumber')
      .populate('assignedTo', 'name email phone profileImage')
      .populate('resolvedBy', 'name email phone profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const formattedComplaints = complaints.map(formatStudentComplaint);

    return {
      complaints: formattedComplaints,
      total: totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / limitNum),
    };
  }

  /**
   * Update complaint status (new method)
   * @param {string} complaintId - Complaint ID
   * @param {string} status - New status
   * @param {string} userId - User ID making the change
   * @returns {Promise<{success: boolean, complaint?: Object, error?: string, statusCode?: number}>}
   */
  async updateStatus(complaintId, status, userId) {
    let complaint;
    if (status === 'Resolved') {
      const date = new Date();
      complaint = await Complaint.findByIdAndUpdate(
        complaintId, 
        { status, resolvedBy: userId, resolutionDate: date }, 
        { new: true }
      );
    } else {
      complaint = await Complaint.findByIdAndUpdate(
        complaintId, 
        { status }, 
        { new: true }
      );
    }

    if (!complaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    return { success: true, complaint };
  }

  /**
   * Update resolution notes
   * @param {string} complaintId - Complaint ID
   * @param {string} resolutionNotes - Resolution notes
   * @returns {Promise<{success: boolean, complaint?: Object, error?: string, statusCode?: number}>}
   */
  async updateResolutionNotes(complaintId, resolutionNotes) {
    const complaint = await Complaint.findByIdAndUpdate(
      complaintId, 
      { resolutionNotes }, 
      { new: true }
    );

    if (!complaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    return { success: true, complaint };
  }

  /**
   * Update complaint feedback
   * @param {string} complaintId - Complaint ID
   * @param {string} userId - User ID making the update
   * @param {Object} feedbackData - Feedback data
   * @returns {Promise<{success: boolean, complaint?: Object, error?: string, statusCode?: number}>}
   */
  async updateFeedback(complaintId, userId, feedbackData) {
    const { feedback, feedbackRating, satisfactionStatus } = feedbackData;

    // Check if complaint exists and user is authorized
    const existingComplaint = await Complaint.findById(complaintId);
    if (!existingComplaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    if (existingComplaint.userId.toString() !== userId.toString()) {
      return { 
        success: false, 
        error: 'You are not authorized to update feedback for this complaint', 
        statusCode: 403 
      };
    }

    const complaint = await Complaint.findByIdAndUpdate(
      complaintId, 
      { feedback, feedbackRating, satisfactionStatus }, 
      { new: true }
    );

    if (!complaint) {
      return { 
        success: false, 
        error: 'Complaint not found', 
        statusCode: 404 
      };
    }

    return { success: true, complaint };
  }
}

export const complaintService = new ComplaintService();
export default ComplaintService;
