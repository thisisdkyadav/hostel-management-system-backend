/**
 * Visitor Service
 * Contains all business logic for visitor request operations.
 * 
 * @module services/visitor
 */

import mongoose from 'mongoose';
import { VisitorRequest } from '../models/index.js';
import { Unit } from '../models/index.js';
import { Room } from '../models/index.js';
import { StudentProfile } from '../models/index.js';
import { checkPaymentStatus } from '../utils/utils.js';
import { getConfigWithDefault } from '../utils/configDefaults.js';
import { BaseService, success, notFound, badRequest, forbidden, error, withTransaction } from './base/index.js';

class VisitorService extends BaseService {
  constructor() {
    super(VisitorRequest, 'Visitor request');
  }

  /**
   * Create a new visitor request
   * @param {Object} data - Visitor request data
   * @param {Object} user - Requesting user
   */
  async createVisitorRequest(data, user) {
    const { visitors, reason, fromDate, toDate, h2FormUrl } = data;

    const result = await this.create({
      visitors,
      reason,
      fromDate,
      toDate,
      userId: user._id,
      h2FormUrl
    });

    if (result.success) {
      return {
        success: true,
        statusCode: 201,
        message: 'Visitor request submitted successfully',
        data: result.data
      };
    }
    return result;
  }

  /**
   * Get visitor requests based on user role
   * @param {Object} user - Requesting user
   */
  async getVisitorRequests(user) {
    const query = {};

    if (user.role === 'Student') {
      query.userId = user._id;
    } else if (user.hostel) {
      query.hostelId = user.hostel._id;
    }

    const systemSettings = await getConfigWithDefault('systemSettings');
    const visitorPaymentLink = systemSettings?.value?.visitorPaymentLink;

    const visitorRequests = await this.model.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'name email profileImage')
      .populate('visitors');

    const formattedRequests = visitorRequests.map((request) => {
      const visitorCount = request.visitors.length;
      const visitorNames = request.visitors.map((v) => v.name).join(', ');
      const isAllocated = request.allocatedRooms?.length > 0;
      const studentProfile = request.userId || null;

      return {
        ...request._doc,
        visitorCount,
        visitorNames,
        isAllocated,
        studentName: studentProfile?.name || '',
        studentEmail: studentProfile?.email || '',
        studentProfileImage: studentProfile?.profileImage || null,
        h2FormUrl: request.h2FormUrl || null,
        visitorPaymentLink
      };
    });

    return success({
      message: 'Visitor requests fetched successfully',
      data: formattedRequests || []
    });
  }

  /**
   * Get a visitor request by ID
   * @param {string} requestId - Request ID
   */
  async getVisitorRequestById(requestId) {
    const systemSettings = await getConfigWithDefault('systemSettings');
    const visitorPaymentLink = systemSettings?.value?.visitorPaymentLink;

    const visitorRequest = await this.model.findById(requestId)
      .populate('userId', 'name email profileImage')
      .populate('visitors')
      .populate({
        path: 'allocatedRooms',
        populate: { path: 'unitId', select: 'unitNumber' }
      })
      .populate('hostelId', 'name');

    if (!visitorRequest) {
      return notFound(this.entityName);
    }

    let studentProfile = null;
    if (visitorRequest.userId) {
      try {
        studentProfile = await StudentProfile.getFullStudentData(visitorRequest.userId._id);
      } catch (err) {
        // Ignore error, studentProfile will be null
      }
    }

    const rooms = visitorRequest.allocatedRooms.map((room) => {
      const unit = room.unitId?.unitNumber || null;
      const roomNumber = room.roomNumber || null;
      return unit ? [roomNumber, unit] : [roomNumber];
    });

    const paymentStatus = (await checkPaymentStatus(visitorRequest.paymentId)) || null;

    const formattedRequest = {
      _id: visitorRequest._id,
      studentId: visitorRequest.userId?._id,
      studentProfileImage: visitorRequest.userId?.profileImage || null,
      studentName: visitorRequest.userId?.name || '',
      studentEmail: visitorRequest.userId?.email || '',
      studentHostel: studentProfile?.hostel || '',
      studentDisplayRoom: studentProfile?.displayRoom || '',
      visitors: visitorRequest.visitors,
      visitorCount: visitorRequest.visitors.length,
      visitorNames: visitorRequest.visitors.map((v) => v.name).join(', '),
      fromDate: visitorRequest.fromDate,
      toDate: visitorRequest.toDate,
      reason: visitorRequest.reason,
      status: visitorRequest.status,
      isAllocated: visitorRequest.allocatedRooms?.length > 0,
      allocatedRooms: rooms || [],
      approveInfo: visitorRequest.approveInfo || null,
      rejectionReason: visitorRequest.reasonForRejection || null,
      hostelId: visitorRequest.hostelId?._id || null,
      hostelName: visitorRequest.hostelId?.name || null,
      checkInTime: visitorRequest.checkInTime || null,
      checkOutTime: visitorRequest.checkOutTime || null,
      securityNotes: visitorRequest.securityNotes || null,
      createdAt: visitorRequest.createdAt,
      paymentLink: visitorRequest.paymentLink || null,
      paymentId: visitorRequest.paymentId || null,
      paymentStatus,
      h2FormUrl: visitorRequest.h2FormUrl || null,
      visitorPaymentLink,
      paymentInfo: visitorRequest.paymentInfo || null
    };

    return success({ message: 'Visitor request fetched successfully', data: formattedRequest });
  }

  /**
   * Update a visitor request
   * @param {string} requestId - Request ID
   * @param {Object} data - Update data
   */
  async updateVisitorRequest(requestId, data) {
    const { reason, fromDate, toDate, h2FormUrl } = data;

    const request = await this.model.findById(requestId);
    if (!request) {
      return notFound(this.entityName);
    }

    if (request.status !== 'Pending') {
      return badRequest('Cannot update a request that is not pending');
    }

    const result = await this.updateById(requestId, { reason, fromDate, toDate, h2FormUrl });
    if (result.success) {
      return success({ message: 'Visitor request updated successfully', data: result.data });
    }
    return result;
  }

  /**
   * Delete a visitor request
   * @param {string} requestId - Request ID
   */
  async deleteVisitorRequest(requestId) {
    const result = await this.deleteById(requestId);
    if (result.success) {
      return success({ message: 'Visitor request deleted successfully' });
    }
    return result;
  }

  /**
   * Update visitor request status (approve/reject)
   * @param {string} requestId - Request ID
   * @param {string} action - 'approve' or 'reject'
   * @param {Object} data - Action data
   */
  async updateVisitorRequestStatus(requestId, action, data) {
    const { reason, hostelId: assignedHostelId, approvalInformation } = data;

    if (action !== 'approve' && action !== 'reject') {
      return badRequest('Invalid action');
    }

    const status = action === 'approve' ? 'Approved' : 'Rejected';
    const updateData = { status };
    
    if (action === 'reject') {
      updateData.reasonForRejection = reason;
    } else {
      updateData.hostelId = assignedHostelId;
      updateData.approveInfo = approvalInformation;
    }

    const result = await this.updateById(requestId, updateData);
    if (result.success) {
      return success({ message: `Visitor request status updated to ${status}`, data: result.data });
    }
    return result;
  }

  /**
   * Allocate rooms to a visitor request
   * @param {string} requestId - Request ID
   * @param {Array} allocationData - Room allocation data
   * @param {Object} user - Requesting user
   */
  async allocateRoomsToVisitorRequest(requestId, allocationData, user) {
    return withTransaction(async (session) => {
      const hostelId = user.hostel._id;

      const allocatedRoomIds = await Promise.all(
        allocationData.map(async (room) => {
          const roomNumber = room[0];
          const unitNumber = room[1] || undefined;

          let unitId;
          if (unitNumber) {
            const unit = await Unit.findOne({ unitNumber, hostelId }).session(session);
            if (!unit) {
              throw new Error(`Unit ${unitNumber} not found in hostel ${user.hostel.name}`);
            }
            unitId = unit._id;
          }

          const foundRoom = await Room.findOne({ roomNumber, unitId, hostelId }).session(session);
          if (!foundRoom) {
            throw new Error(`Room ${roomNumber} not found in unit ${unitNumber}`);
          }
          if (foundRoom.occupancy) {
            throw new Error(`Room ${roomNumber} in unit ${unitNumber} is already occupied by a student`);
          }
          return foundRoom._id;
        })
      );

      const updatedReq = await this.model.findByIdAndUpdate(
        requestId,
        { allocatedRooms: allocatedRoomIds },
        { new: true, session }
      );

      if (!updatedReq) {
        throw new Error('Visitor request not found');
      }

      return success({ message: 'Rooms allocated successfully', data: updatedReq });
    });
  }

  /**
   * Check in a visitor
   * @param {string} requestId - Request ID
   * @param {Object} data - Check-in data
   */
  async checkInVisitor(requestId, data) {
    const { checkInTime, notes: securityNotes } = data;

    const result = await this.updateById(requestId, { checkInTime, securityNotes });
    if (result.success) {
      return success({ message: 'Check-in successful', data: result.data });
    }
    return result;
  }

  /**
   * Check out a visitor
   * @param {string} requestId - Request ID
   * @param {Object} data - Check-out data
   */
  async checkOutVisitor(requestId, data) {
    const { checkOutTime, notes: securityNotes } = data;

    const result = await this.updateById(requestId, { checkOutTime, securityNotes });
    if (result.success) {
      return success({ message: 'Check-out successful', data: result.data });
    }
    return result;
  }

  /**
   * Update check-in/check-out time
   * @param {string} requestId - Request ID
   * @param {Object} data - Time data
   */
  async updateCheckTime(requestId, data) {
    const { checkInTime, checkOutTime, notes: securityNotes } = data;

    const result = await this.updateById(requestId, { checkInTime, checkOutTime, securityNotes });
    if (result.success) {
      return success({ message: 'Check-in/out time updated successfully', data: result.data });
    }
    return result;
  }

  /**
   * Get visitor requests for a specific student
   * @param {string} userId - User ID
   */
  async getStudentVisitorRequests(userId) {
    const visitorRequests = await this.model.find({ userId })
      .populate('userId', 'name email profileImage')
      .populate('visitors');

    const formattedRequests = visitorRequests.map((request) => ({
      ...request._doc,
      visitorCount: request.visitors.length,
      visitorNames: request.visitors.map((v) => v.name).join(', '),
      isAllocated: request.allocatedRooms?.length > 0
    }));

    return success({ message: 'Visitor requests fetched successfully', data: formattedRequests || [] });
  }

  /**
   * Update payment information for a visitor request
   * @param {string} requestId - Request ID
   * @param {Object} data - Payment data
   * @param {Object} user - Requesting user
   */
  async updatePaymentInfo(requestId, data, user) {
    const { amount, dateOfPayment, screenshot, additionalInfo, transactionId } = data;

    const visitorRequest = await this.model.findById(requestId);
    if (!visitorRequest) {
      return notFound(this.entityName);
    }

    if (visitorRequest.userId.toString() !== user._id.toString()) {
      return forbidden('You are not authorized to update this payment information');
    }

    const result = await this.updateById(requestId, {
      paymentInfo: { amount, dateOfPayment, screenshot, additionalInfo, transactionId }
    });

    if (result.success) {
      return success({ message: 'Payment information updated successfully', data: result.data });
    }
    return result;
  }
}

export const visitorService = new VisitorService();
export default visitorService;
