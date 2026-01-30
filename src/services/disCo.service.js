/**
 * DisCo Service
 * Handles disciplinary action operations
 * 
 * @module services/disCo.service
 */

import DisCoAction from '../../models/DisCoAction.js';
import StudentProfile from '../../models/StudentProfile.js';
import { BaseService, success, notFound, USER_BASIC } from './base/index.js';

class DisCoService extends BaseService {
  constructor() {
    super(DisCoAction, 'DisCo action');
  }

  /**
   * Add disciplinary action for a student
   * @param {Object} data - Action data with studentId
   */
  async addDisCoAction(data) {
    const { studentId, reason, actionTaken, date, remarks } = data;

    // Verify student exists
    const studentProfile = await StudentProfile.findOne({ userId: studentId });
    if (!studentProfile) {
      return notFound('Student profile');
    }

    const result = await this.create({
      userId: studentId,
      reason,
      actionTaken,
      date,
      remarks
    });

    if (result.success) {
      return success({ message: 'DisCo action added successfully' }, 201);
    }
    return result;
  }

  /**
   * Get disciplinary actions for a student
   * @param {string} studentId - Student user ID
   */
  async getDisCoActionsByStudent(studentId) {
    const result = await this.findAll(
      { userId: studentId },
      { populate: [{ path: 'userId', select: 'name email' }] }
    );

    if (result.success) {
      return success({
        success: true,
        message: 'Disciplinary actions fetched successfully',
        actions: result.data
      });
    }
    return result;
  }

  /**
   * Update disciplinary action
   * @param {string} disCoId - DisCo action ID
   * @param {Object} data - Update data
   */
  async updateDisCoAction(disCoId, data) {
    const result = await this.updateById(disCoId, data);
    if (result.success) {
      return success({ message: 'DisCo action updated successfully', action: result.data });
    }
    return result;
  }

  /**
   * Delete disciplinary action
   * @param {string} disCoId - DisCo action ID
   */
  async deleteDisCoAction(disCoId) {
    const result = await this.deleteById(disCoId);
    if (result.success) {
      return success({ message: 'DisCo action deleted successfully' });
    }
    return result;
  }
}

export const disCoService = new DisCoService();
