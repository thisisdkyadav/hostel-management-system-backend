/**
 * Visitor Profile Service
 * Handles saved visitor profile operations
 *
 * @module apps/visitors/modules/visitors/visitor-profile.service
 */

import { success, notFound, error } from '../../../../services/base/index.js';
import { visitorOwner } from '../../../../services/visitor/visitorOwner.service.js';
import { visitorQueries } from '../../../../services/visitor/visitorQueries.service.js';

const ENTITY = 'Visitor profile';

class VisitorProfileService {
  /**
   * Get visitor profiles for a student
   * @param {string} userId - Student user ID
   */
  async getVisitorProfiles(userId) {
    const profiles = await visitorQueries.findProfilesByStudent(userId);
    return success({
      message: 'Visitor profiles fetched successfully',
      success: true,
      data: profiles || []
    });
  }

  /**
   * Create visitor profile
   * @param {string} userId - Student user ID
   * @param {Object} data - Profile data
   */
  async createVisitorProfile(userId, data) {
    const visitorProfile = await visitorOwner.createProfile({
      studentUserId: userId,
      ...data
    });

    return success(
      { message: 'Visitor profile created successfully', visitorProfile, success: true },
      201
    );
  }

  /**
   * Update visitor profile
   * @param {string} visitorId - Visitor profile ID
   * @param {Object} data - Update data
   */
  async updateVisitorProfile(visitorId, data) {
    try {
      const visitorProfile = await visitorOwner.updateProfileById(visitorId, data);
      if (!visitorProfile) {
        return notFound(ENTITY);
      }
      return success({ message: 'Visitor profile updated successfully', visitorProfile });
    } catch (err) {
      // pre('findOneAndUpdate') guard throws when the profile has linked requests.
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }
  }

  /**
   * Delete visitor profile
   * @param {string} visitorId - Visitor profile ID
   */
  async deleteVisitorProfile(visitorId) {
    try {
      const deleted = await visitorOwner.deleteProfileById(visitorId);
      if (!deleted) {
        return notFound(ENTITY);
      }
      return success({ message: 'Visitor profile deleted successfully', success: true });
    } catch (err) {
      // pre('findOneAndDelete') guard throws when the profile has linked requests.
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }
  }
}

export const visitorProfileService = new VisitorProfileService();
