/**
 * Leave Service
 * Contains all business logic for leave operations.
 * 
 * @module services/leave
 */

import { Leave } from '../../../../models/index.js';
import { BaseService, success, notFound, error } from '../../../../services/base/index.js';

class LeaveService extends BaseService {
  constructor() {
    super(Leave, 'Leave');
  }

  /**
   * Create a new leave request
   * @param {Object} data - Leave data
   * @param {string} userId - User ID
   */
  async createLeave(data, userId) {
    const { reason, startDate, endDate } = data;
    try {
      const result = await this.create({ userId, reason, startDate, endDate });
      if (result.success) {
        return success({ message: 'Leave created successfully', leave: result.data }, 201);
      }
      return result;
    } catch (err) {
      return error('Error creating leave', 500, err.message);
    }
  }

  /**
   * Get leaves for a specific user
   * @param {string} userId - User ID
   */
  async getMyLeaves(userId) {
    try {
      const result = await this.findAll({ userId });
      if (result.success) {
        return success({ leaves: result.data });
      }
      return result;
    } catch (err) {
      return error('Error getting leaves', 500, err.message);
    }
  }

  /**
   * Get leaves with filters and pagination
   * @param {Object} query - Query params
   */
  async getLeaves(query) {
    const { userId, status, startDate, endDate, page = 1, limit = 10 } = query;
    try {
      const queryObj = {};
      if (userId) queryObj.userId = userId;
      if (status) queryObj.status = status;
      if (startDate || endDate) {
        queryObj.createdAt = {};
        if (startDate) queryObj.createdAt.$gte = new Date(startDate);
        if (endDate) queryObj.createdAt.$lte = new Date(endDate);
      }

      const result = await this.findPaginated(queryObj, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        populate: [{ path: 'userId', select: 'name email' }],
      });

      if (result.success) {
        const { items, pagination } = result.data;
        return success({
          leaves: items,
          totalCount: pagination.total,
          totalPages: pagination.totalPages,
          currentPage: pagination.page,
          limit: pagination.limit,
        });
      }
      return result;
    } catch (err) {
      return error('Error getting leaves', 500, err.message);
    }
  }

  /**
   * Approve a leave request
   * @param {string} id - Leave ID
   * @param {Object} data - Approval data
   * @param {string} approvalBy - Approving user ID
   */
  async approveLeave(id, data, approvalBy) {
    const { approvalInfo } = data;
    try {
      const leave = await this.model.findByIdAndUpdate(
        id,
        { status: 'Approved', approvalInfo, approvalDate: new Date(), approvalBy },
        { new: true }
      );
      if (!leave) {
        return notFound(this.entityName);
      }
      return success({ message: 'Leave approved successfully', leave });
    } catch (err) {
      return error('Error approving leave', 500, err.message);
    }
  }

  /**
   * Reject a leave request
   * @param {string} id - Leave ID
   * @param {Object} data - Rejection data
   * @param {string} approvalBy - Rejecting user ID
   */
  async rejectLeave(id, data, approvalBy) {
    const { reasonForRejection } = data;
    try {
      const leave = await this.model.findByIdAndUpdate(
        id,
        { status: 'Rejected', reasonForRejection, approvalDate: new Date(), approvalBy },
        { new: true }
      );
      if (!leave) {
        return notFound(this.entityName);
      }
      return success({ message: 'Leave rejected successfully', leave });
    } catch (err) {
      return error('Error rejecting leave', 500, err.message);
    }
  }

  /**
   * Mark leave as joined
   * @param {string} id - Leave ID
   * @param {Object} data - Join data
   */
  async joinLeave(id, data) {
    const { joinInfo } = data;
    try {
      const leave = await this.model.findByIdAndUpdate(
        id,
        { joinInfo, joinDate: new Date(), joinStatus: 'Joined' },
        { new: true }
      );
      if (!leave) {
        return notFound(this.entityName);
      }
      return success({ message: 'Leave joined successfully', leave });
    } catch (err) {
      return error('Error joining leave', 500, err.message);
    }
  }
}

export const leaveService = new LeaveService();
