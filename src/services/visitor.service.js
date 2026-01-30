/**
 * Visitor Service
 * Contains all business logic for visitor request operations.
 * 
 * @module services/visitor
 */

import mongoose from 'mongoose';
import VisitorRequest from '../../models/VisitorRequest.js';
import Unit from '../../models/Unit.js';
import Room from '../../models/Room.js';
import StudentProfile from '../../models/StudentProfile.js';
import { checkPaymentStatus } from '../../utils/utils.js';
import { getConfigWithDefault } from '../../utils/configDefaults.js';

class VisitorService {
  /**
   * Create a new visitor request
   * @param {Object} data - Visitor request data
   * @param {Object} user - Requesting user
   * @returns {Object} Result object
   */
  async createVisitorRequest(data, user) {
    const { visitors, reason, fromDate, toDate, h2FormUrl } = data;

    const visitorRequest = new VisitorRequest({
      visitors,
      reason,
      fromDate,
      toDate,
      userId: user._id,
      h2FormUrl,
    });

    await visitorRequest.save();

    return {
      success: true,
      statusCode: 201,
      message: 'Visitor request submitted successfully',
      data: visitorRequest,
    };
  }

  /**
   * Get visitor requests based on user role
   * @param {Object} user - Requesting user
   * @returns {Object} Result object
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

    // newest first
    const visitorRequests = await VisitorRequest.find(query).sort({ createdAt: -1 }).populate('userId', 'name email profileImage').populate('visitors');

    const formattedRequests = visitorRequests.map((request) => {
      const visitorCount = request.visitors.length;
      const visitorNames = request.visitors.map((visitor) => visitor.name).join(', ');
      const isAllocated = request.allocatedRooms && request.allocatedRooms.length > 0;
      const studentProfile = request.userId ? request.userId : null;
      const studentName = studentProfile ? studentProfile.name : '';
      const studentEmail = studentProfile ? studentProfile.email : '';
      const studentProfileImage = studentProfile ? studentProfile.profileImage : null;
      const h2FormUrl = request.h2FormUrl ? request.h2FormUrl : null;

      return {
        ...request._doc,
        visitorCount,
        visitorNames,
        isAllocated,
        studentName,
        studentEmail,
        studentProfileImage,
        h2FormUrl,
        visitorPaymentLink,
      };
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor requests fetched successfully',
      data: formattedRequests || [],
    };
  }

  /**
   * Get a visitor request by ID
   * @param {string} requestId - Request ID
   * @returns {Object} Result object
   */
  async getVisitorRequestById(requestId) {
    const systemSettings = await getConfigWithDefault('systemSettings');
    const visitorPaymentLink = systemSettings?.value?.visitorPaymentLink;

    const visitorRequest = await VisitorRequest.findById(requestId)
      .populate('userId', 'name email profileImage')
      .populate('visitors')
      .populate({
        path: 'allocatedRooms',
        populate: {
          path: 'unitId',
          select: 'unitNumber',
        },
      })
      .populate('hostelId', 'name');

    if (!visitorRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    let studentProfile = null;
    if (visitorRequest.userId) {
      try {
        studentProfile = await StudentProfile.getFullStudentData(visitorRequest.userId._id);
      } catch (err) {
        console.error('Error fetching student profile:', err);
      }
    }

    const rooms = visitorRequest.allocatedRooms.map((room) => {
      const unit = room.unitId ? room.unitId.unitNumber : null;
      const roomNumber = room.roomNumber ? room.roomNumber : null;
      return unit ? [roomNumber, unit] : [roomNumber];
    });

    const visitorCount = visitorRequest.visitors.length;
    const visitorNames = visitorRequest.visitors.map((visitor) => visitor.name).join(', ');
    const isAllocated = visitorRequest.allocatedRooms && visitorRequest.allocatedRooms.length > 0;
    const h2FormUrl = visitorRequest.h2FormUrl ? visitorRequest.h2FormUrl : null;

    const paymentStatus = (await checkPaymentStatus(visitorRequest.paymentId)) || null;

    // Construct the formatted response
    const formattedRequest = {
      _id: visitorRequest._id,
      studentId: visitorRequest.userId?._id,
      studentProfileImage: visitorRequest.userId?.profileImage || null,
      studentName: visitorRequest.userId?.name || '',
      studentEmail: visitorRequest.userId?.email || '',
      studentHostel: studentProfile?.hostel || '',
      studentDisplayRoom: studentProfile?.displayRoom || '',
      visitors: visitorRequest.visitors,
      visitorCount,
      visitorNames,
      fromDate: visitorRequest.fromDate,
      toDate: visitorRequest.toDate,
      reason: visitorRequest.reason,
      status: visitorRequest.status,
      isAllocated,
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
      h2FormUrl,
      visitorPaymentLink,
      paymentInfo: visitorRequest.paymentInfo || null,
    };

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor request fetched successfully',
      data: formattedRequest,
    };
  }

  /**
   * Update a visitor request
   * @param {string} requestId - Request ID
   * @param {Object} data - Update data
   * @returns {Object} Result object
   */
  async updateVisitorRequest(requestId, data) {
    const { reason, fromDate, toDate, h2FormUrl } = data;

    const request = await VisitorRequest.findById(requestId);
    if (!request) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    if (request.status !== 'Pending') {
      return {
        success: false,
        statusCode: 400,
        message: 'Cannot update a request that is not pending',
      };
    }

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { reason, fromDate, toDate, h2FormUrl }, { new: true });

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor request updated successfully',
      data: updatedRequest,
    };
  }

  /**
   * Delete a visitor request
   * @param {string} requestId - Request ID
   * @returns {Object} Result object
   */
  async deleteVisitorRequest(requestId) {
    const deletedRequest = await VisitorRequest.findByIdAndDelete(requestId);

    if (!deletedRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor request deleted successfully',
    };
  }

  /**
   * Update visitor request status (approve/reject)
   * @param {string} requestId - Request ID
   * @param {string} action - 'approve' or 'reject'
   * @param {Object} data - Action data
   * @returns {Object} Result object
   */
  async updateVisitorRequestStatus(requestId, action, data) {
    const { reason, hostelId: assignedHostelId, approvalInformation } = data;

    if (action !== 'approve' && action !== 'reject') {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid action',
      };
    }

    const status = action === 'approve' ? 'Approved' : 'Rejected';
    const reasonForRejection = action === 'reject' ? reason : undefined;
    const hostelId = action === 'approve' ? assignedHostelId : undefined;
    const approveInfo = action === 'approve' ? approvalInformation : undefined;

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { status, reasonForRejection, hostelId, approveInfo }, { new: true });

    if (!updatedRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: `Visitor request status updated to ${status}`,
      data: updatedRequest,
    };
  }

  /**
   * Allocate rooms to a visitor request
   * @param {string} requestId - Request ID
   * @param {Array} allocationData - Room allocation data
   * @param {Object} user - Requesting user
   * @returns {Object} Result object
   */
  async allocateRoomsToVisitorRequest(requestId, allocationData, user) {
    const session = await mongoose.startSession();

    try {
      const updatedRequest = await session.withTransaction(async () => {
        const hostelId = user.hostel._id;

        const allocatedRoomIds = await Promise.all(
          allocationData.map(async (room) => {
            const roomNumber = room[0];
            const unitNumber = room[1] ? room[1] : undefined;

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

        const updatedReq = await VisitorRequest.findByIdAndUpdate(requestId, { allocatedRooms: allocatedRoomIds }, { new: true, session });

        if (!updatedReq) {
          throw new Error('Visitor request not found');
        }

        return updatedReq;
      });

      return {
        success: true,
        statusCode: 200,
        message: 'Rooms allocated successfully',
        data: updatedRequest,
      };
    } catch (error) {
      console.error('Error allocating rooms to visitor request:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Check in a visitor
   * @param {string} requestId - Request ID
   * @param {Object} data - Check-in data
   * @returns {Object} Result object
   */
  async checkInVisitor(requestId, data) {
    const { checkInTime, notes: securityNotes } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkInTime, securityNotes }, { new: true, session });

      if (!updatedRequest) {
        throw new Error('Visitor request not found');
      }

      await session.commitTransaction();
      
      return {
        success: true,
        statusCode: 200,
        message: 'Check-in successful',
        data: updatedRequest,
      };
    } catch (error) {
      console.error('Error checking in visitor:', error);
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Check out a visitor
   * @param {string} requestId - Request ID
   * @param {Object} data - Check-out data
   * @returns {Object} Result object
   */
  async checkOutVisitor(requestId, data) {
    const { checkOutTime, notes: securityNotes } = data;

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkOutTime, securityNotes }, { new: true, session });

      if (!updatedRequest) {
        throw new Error('Visitor request not found');
      }

      await session.commitTransaction();
      
      return {
        success: true,
        statusCode: 200,
        message: 'Check-out successful',
        data: updatedRequest,
      };
    } catch (error) {
      console.error('Error checking out visitor:', error);
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Update check-in/check-out time
   * @param {string} requestId - Request ID
   * @param {Object} data - Time data
   * @returns {Object} Result object
   */
  async updateCheckTime(requestId, data) {
    console.log('updateCheckTime called');

    const { checkInTime, checkOutTime, notes: securityNotes } = data;

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkInTime, checkOutTime, securityNotes }, { new: true });

    if (!updatedRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Check-in/out time updated successfully',
      data: updatedRequest,
    };
  }

  /**
   * Get visitor requests for a specific student
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getStudentVisitorRequests(userId) {
    const visitorRequests = await VisitorRequest.find({ userId }).populate('userId', 'name email profileImage').populate('visitors');

    const formattedRequests = visitorRequests.map((request) => {
      const visitorCount = request.visitors.length;
      const visitorNames = request.visitors.map((visitor) => visitor.name).join(', ');
      const isAllocated = request.allocatedRooms && request.allocatedRooms.length > 0;

      return {
        ...request._doc,
        visitorCount,
        visitorNames,
        isAllocated,
      };
    });

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor requests fetched successfully',
      data: formattedRequests || [],
    };
  }

  /**
   * Update payment information for a visitor request
   * @param {string} requestId - Request ID
   * @param {Object} data - Payment data
   * @param {Object} user - Requesting user
   * @returns {Object} Result object
   */
  async updatePaymentInfo(requestId, data, user) {
    const { amount, dateOfPayment, screenshot, additionalInfo, transactionId } = data;

    const visitorRequest = await VisitorRequest.findById(requestId);
    if (!visitorRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    if (visitorRequest.userId.toString() !== user._id.toString()) {
      return {
        success: false,
        statusCode: 403,
        message: 'You are not authorized to update this payment information',
      };
    }

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(
      requestId,
      {
        paymentInfo: {
          amount,
          dateOfPayment,
          screenshot,
          additionalInfo,
          transactionId,
        },
      },
      { new: true }
    );

    if (!updatedRequest) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor request not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Payment information updated successfully',
      data: updatedRequest,
    };
  }
}

export const visitorService = new VisitorService();
export default visitorService;
