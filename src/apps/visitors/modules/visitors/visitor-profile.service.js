/**
 * Visitor Profile Service
 * Handles saved visitor profile operations
 * 
 * @module apps/visitors/modules/visitors/visitor-profile.service
 */

import { VisitorProfile } from '../../../../models/index.js';
import { BaseService, success } from '../../../../services/base/index.js';

class VisitorProfileService extends BaseService {
  constructor() {
    super(VisitorProfile, 'Visitor profile');
  }

  /**
   * Get visitor profiles for a student
   * @param {string} userId - Student user ID
   */
  async getVisitorProfiles(userId) {
    const result = await this.findAll({ studentUserId: userId });
    if (result.success) {
      return success({
        message: 'Visitor profiles fetched successfully',
        success: true,
        data: result.data || []
      });
    }
    return result;
  }

  /**
   * Create visitor profile
   * @param {string} userId - Student user ID
   * @param {Object} data - Profile data
   */
  async createVisitorProfile(userId, data) {
    const result = await this.create({
      studentUserId: userId,
      ...data
    });

    if (result.success) {
      return success(
        { message: 'Visitor profile created successfully', visitorProfile: result.data, success: true },
        201
      );
    }
    return result;
  }

  /**
   * Update visitor profile
   * @param {string} visitorId - Visitor profile ID
   * @param {Object} data - Update data
   */
  async updateVisitorProfile(visitorId, data) {
    const result = await this.updateById(visitorId, data);
    if (result.success) {
      return success({ message: 'Visitor profile updated successfully', visitorProfile: result.data });
    }
    return result;
  }

  /**
   * Delete visitor profile
   * @param {string} visitorId - Visitor profile ID
   */
  async deleteVisitorProfile(visitorId) {
    const result = await this.deleteById(visitorId);
    if (result.success) {
      return success({ message: 'Visitor profile deleted successfully', success: true });
    }
    return result;
  }
}

export const visitorProfileService = new VisitorProfileService();
