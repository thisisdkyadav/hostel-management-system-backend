/**
 * Leave Service
 * Contains all business logic for leave operations.
 * 
 * @module services/leave
 */

import { success, notFound, error } from '../../../../services/base/index.js';
import { leaveOwner } from '../../../../services/leave/leaveOwner.service.js';
import { leaveQueries } from '../../../../services/leave/leaveQueries.service.js';

const ENTITY = 'Leave';

class LeaveService {
  /**
   * Create a new leave request
   * @param {Object} data - Leave data
   * @param {string} userId - User ID
   */
  async createLeave(data, userId) {
    const { reason, startDate, endDate } = data;
    try {
      const leave = await leaveOwner.createLeave({ userId, reason, startDate, endDate });
      return success({ message: 'Leave created successfully', leave }, 201);
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
      const leaves = await leaveQueries.findByUser(userId);
      return success({ leaves });
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

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const [items, totalCount] = await Promise.all([
        leaveQueries.listLeaves(queryObj, { skip: (pageNum - 1) * limitNum, limit: limitNum }),
        leaveQueries.countLeaves(queryObj),
      ]);

      return success({
        leaves: items,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      });
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
      const leave = await leaveOwner.updateLeaveById(id, {
        status: 'Approved',
        approvalInfo,
        approvalDate: new Date(),
        approvalBy,
      });
      if (!leave) {
        return notFound(ENTITY);
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
      const leave = await leaveOwner.updateLeaveById(id, {
        status: 'Rejected',
        reasonForRejection,
        approvalDate: new Date(),
        approvalBy,
      });
      if (!leave) {
        return notFound(ENTITY);
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
      const leave = await leaveOwner.updateLeaveById(id, {
        joinInfo,
        joinDate: new Date(),
        joinStatus: 'Joined',
      });
      if (!leave) {
        return notFound(ENTITY);
      }
      return success({ message: 'Leave joined successfully', leave });
    } catch (err) {
      return error('Error joining leave', 500, err.message);
    }
  }
}

export const leaveService = new LeaveService();
