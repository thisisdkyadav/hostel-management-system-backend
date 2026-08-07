/**
 * Visitors Service
 * Contains all business logic for visitor request operations.
 *
 * @module apps/visitors/modules/visitors/service
 */

import { StudentProfile } from '../../../../models/index.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import { visitorOwner } from '../../../../services/visitor/visitorOwner.service.js';
import { visitorQueries } from '../../../../services/visitor/visitorQueries.service.js';
import { getConfigWithDefault } from '../../../../utils/configDefaults.js';
import {
  success,
  notFound,
  badRequest,
  forbidden,
  error,
  withTransaction,
} from '../../../../services/base/index.js';

const ENTITY = 'Visitor request';

class VisitorsService {
  /**
   * Create a new visitor request
   * @param {Object} data - Visitor request data
   * @param {Object} user - Requesting user
   */
  async createVisitorRequest(data, user) {
    const { visitors, reason, fromDate, toDate, h2FormUrl } = data;

    const created = await visitorOwner.createRequest({
      visitors,
      reason,
      fromDate,
      toDate,
      userId: user._id,
      h2FormUrl,
    });

    return {
      success: true,
      statusCode: 201,
      message: 'Visitor request submitted successfully',
      data: created,
    };
  }

  /**
   * Get visitor requests based on user role
   * @param {Object} user - Requesting user
   * @param {Object} queryParams - Query params ({ page, limit, status, allocation })
   */
  async getVisitorRequests(user, queryParams = {}) {
    const query = {};
    const page = Math.max(1, Number.parseInt(queryParams.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(queryParams.limit, 10) || 10));

    const normalizedStatus = String(queryParams.status || 'all').trim().toLowerCase();
    const statusMap = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
    };

    const normalizedAllocation = String(queryParams.allocation || 'all').trim().toLowerCase();

    if (user.role === 'Student') {
      query.userId = user._id;
    } else if (user.hostel) {
      query.hostelId = user.hostel._id;
    }

    if (statusMap[normalizedStatus]) {
      query.status = statusMap[normalizedStatus];
    }

    if (normalizedAllocation === 'allocated') {
      query['allocatedRooms.0'] = { $exists: true };
    } else if (normalizedAllocation === 'unallocated') {
      query['allocatedRooms.0'] = { $exists: false };
    }

    const systemSettings = await getConfigWithDefault('systemSettings');
    const visitorPaymentLink = systemSettings?.value?.visitorPaymentLink;

    const skip = (page - 1) * limit;

    const [visitorRequests, total] = await Promise.all([
      visitorQueries.findRequestsForList(query, { skip, limit }),
      visitorQueries.countRequests(query),
    ]);

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

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor requests fetched successfully',
      data: formattedRequests || [],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get a visitor request by ID
   * @param {string} requestId - Request ID
   */
  async getVisitorRequestById(requestId) {
    const systemSettings = await getConfigWithDefault('systemSettings');
    const visitorPaymentLink = systemSettings?.value?.visitorPaymentLink;

    const visitorRequest = await visitorQueries.findRequestByIdDetailed(requestId);

    if (!visitorRequest) {
      return notFound(ENTITY);
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

    // Payment status check removed - feature not in use
    const paymentStatus = null;

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

    const request = await visitorQueries.findRequestById(requestId);
    if (!request) {
      return notFound(ENTITY);
    }

    if (request.status !== 'Pending') {
      return badRequest('Cannot update a request that is not pending');
    }

    const updated = await visitorOwner.updateRequestById(requestId, { reason, fromDate, toDate, h2FormUrl });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: 'Visitor request updated successfully', data: updated });
  }

  /**
   * Delete a visitor request
   * @param {string} requestId - Request ID
   */
  async deleteVisitorRequest(requestId) {
    try {
      const deleted = await visitorOwner.deleteRequestById(requestId);
      if (!deleted) {
        return notFound(ENTITY);
      }
      return success({ message: 'Visitor request deleted successfully' });
    } catch (err) {
      // pre('findOneAndDelete') guard throws for a non-pending request.
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }
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

    const updated = await visitorOwner.updateRequestById(requestId, updateData);
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: `Visitor request status updated to ${status}`, data: updated });
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

      // Sequential, not Promise.all: every query here shares one transaction
      // session, and a ClientSession cannot run operations concurrently. Parallel
      // queries race to start the transaction at the same txnNumber, which MongoDB
      // rejects ("Only servers in a sharded cluster can start a new transaction at
      // the active transaction number").
      const allocatedRoomIds = [];
      for (const room of allocationData) {
        const roomNumber = room[0];
        const unitNumber = room[1] || undefined;

        let unitId;
        if (unitNumber) {
          const unit = await hostelQueries.findUnitByNumber(hostelId, unitNumber, { session });
          if (!unit) {
            throw new Error(`Unit ${unitNumber} not found in hostel ${user.hostel.name}`);
          }
          unitId = unit._id;
        }

        const foundRoom = await hostelQueries.findRoomByNumber(hostelId, roomNumber, { unitId, session });
        if (!foundRoom) {
          throw new Error(`Room ${roomNumber} not found in unit ${unitNumber}`);
        }
        if (foundRoom.occupancy) {
          throw new Error(`Room ${roomNumber} in unit ${unitNumber} is already occupied by a student`);
        }
        allocatedRoomIds.push(foundRoom._id);
      }

      const updatedReq = await visitorOwner.updateRequestById(
        requestId,
        { allocatedRooms: allocatedRoomIds },
        { session }
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

    const updated = await visitorOwner.updateRequestById(requestId, { checkInTime, securityNotes });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: 'Check-in successful', data: updated });
  }

  /**
   * Check out a visitor
   * @param {string} requestId - Request ID
   * @param {Object} data - Check-out data
   */
  async checkOutVisitor(requestId, data) {
    const { checkOutTime, notes: securityNotes } = data;

    const updated = await visitorOwner.updateRequestById(requestId, { checkOutTime, securityNotes });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: 'Check-out successful', data: updated });
  }

  /**
   * Update check-in/check-out time
   * @param {string} requestId - Request ID
   * @param {Object} data - Time data
   */
  async updateCheckTime(requestId, data) {
    const { checkInTime, checkOutTime, notes: securityNotes } = data;

    const updated = await visitorOwner.updateRequestById(requestId, {
      checkInTime,
      checkOutTime,
      securityNotes,
    });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: 'Check-in/out time updated successfully', data: updated });
  }

  /**
   * Get visitor requests for a specific student
   * @param {string} userId - User ID
   */
  async getStudentVisitorRequests(userId) {
    const visitorRequests = await visitorQueries.findRequestsByUser(userId);

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

    const visitorRequest = await visitorQueries.findRequestById(requestId);
    if (!visitorRequest) {
      return notFound(ENTITY);
    }

    if (visitorRequest.userId.toString() !== user._id.toString()) {
      return forbidden('You are not authorized to update this payment information');
    }

    const updated = await visitorOwner.updateRequestById(requestId, {
      paymentInfo: { amount, dateOfPayment, screenshot, additionalInfo, transactionId }
    });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success({ message: 'Payment information updated successfully', data: updated });
  }
}

export const visitorsService = new VisitorsService();
export default visitorsService;
