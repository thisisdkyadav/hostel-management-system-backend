/**
 * Family Member Service
 * Handles family member operations
 * 
 * @module services/familyMember.service
 */

import { FamilyMember } from '../../../../models/index.js';
import { User } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, notFound, badRequest, withTransaction } from '../../../../services/base/index.js';

class FamilyMemberService extends BaseService {
  constructor() {
    super(FamilyMember, 'Family member');
  }

  /**
   * Create a family member
   * @param {string} userId - User ID
   * @param {Object} data - Family member data
   */
  async createFamilyMember(userId, data) {
    const user = await User.findById(userId);
    if (!user) {
      return notFound('User');
    }

    const result = await this.create({ userId, ...data });
    if (result.success) {
      return success({ message: 'Family member created successfully', familyMember: result.data }, 201);
    }
    return result;
  }

  /**
   * Get family members for a user
   * @param {string} userId - User ID
   */
  async getFamilyMembers(userId) {
    const result = await this.findAll({ userId });
    if (result.success) {
      return success({ message: 'Family members fetched successfully', data: result.data });
    }
    return result;
  }

  /**
   * Update a family member
   * @param {string} id - Family member ID
   * @param {Object} data - Update data
   */
  async updateFamilyMember(id, data) {
    const result = await this.updateById(id, data);
    if (result.success) {
      return success({ message: 'Family member updated successfully', familyMember: result.data });
    }
    return result;
  }

  /**
   * Delete a family member
   * @param {string} id - Family member ID
   */
  async deleteFamilyMember(id) {
    const result = await this.deleteById(id);
    if (result.success) {
      return success({ message: 'Family member deleted successfully' });
    }
    return result;
  }

  /**
   * Bulk update family members
   * @param {Object} data - Bulk data with familyData.members array
   */
  async updateBulkFamilyMembers(data) {
    const { familyData } = data;

    if (!familyData || !Array.isArray(familyData.members) || familyData.members.length === 0) {
      return badRequest('Valid family members data is required');
    }

    return withTransaction(async (session) => {
      const rollNumbers = [...new Set(familyData.members.map((m) => m.rollNumber.toUpperCase()))];

      const studentProfiles = await StudentProfile.find({
        rollNumber: { $in: rollNumbers }
      }).session(session);

      if (studentProfiles.length === 0) {
        return notFound('No students found with the provided roll numbers');
      }

      const studentProfileMap = {};
      studentProfiles.forEach((profile) => {
        studentProfileMap[profile.rollNumber] = profile;
      });

      const results = { success: [], notFound: [] };

      // Delete existing if requested
      if (familyData.deleteExisting) {
        const userIds = studentProfiles.map((p) => p.userId);
        await this.model.deleteMany({ userId: { $in: userIds } }).session(session);
      }

      // Prepare family members
      const familyMembersToCreate = [];
      for (const member of familyData.members) {
        const rollNumber = member.rollNumber.toUpperCase();

        if (!studentProfileMap[rollNumber]) {
          results.notFound.push(rollNumber);
          continue;
        }

        const studentProfile = studentProfileMap[rollNumber];
        familyMembersToCreate.push({
          userId: studentProfile.userId,
          name: member.name,
          relationship: member.relationship || '',
          phone: member.phone || '',
          email: member.email || '',
          address: member.address || ''
        });

        results.success.push({
          rollNumber,
          name: member.name,
          userId: studentProfile.userId
        });
      }

      if (familyMembersToCreate.length > 0) {
        await this.model.insertMany(familyMembersToCreate, { session });
      }

      return success({
        success: true,
        message: 'Family members updated successfully',
        data: {
          totalUpdated: results.success.length,
          totalProcessed: familyData.members.length,
          notFoundCount: results.notFound.length,
          failedCount: 0,
          notFound: results.notFound,
          failed: []
        }
      });
    });
  }
}

export const familyMemberService = new FamilyMemberService();
