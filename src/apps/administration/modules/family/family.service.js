/**
 * Family Member Service
 * Handles family member operations
 * 
 * @module services/familyMember.service
 */

import { User } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { success, notFound, badRequest, withTransaction } from '../../../../services/base/index.js';
import { familyOwner } from '../../../../services/family/familyOwner.service.js';
import { familyQueries } from '../../../../services/family/familyQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

class FamilyMemberService {
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

    const familyMember = await familyOwner.create({ userId, ...data });
    return success({ message: 'Family member created successfully', familyMember }, 201);
  }

  /**
   * Get family members for a user
   * @param {string} userId - User ID
   */
  async getFamilyMembers(userId) {
    const familyMembers = await familyQueries.findByUserId(userId);
    return success({ message: 'Family members fetched successfully', data: familyMembers });
  }

  /**
   * Update a family member
   * @param {string} id - Family member ID
   * @param {Object} data - Update data
   */
  async updateFamilyMember(id, data) {
    const familyMember = await familyOwner.updateById(id, data);
    if (!familyMember) {
      return notFound('Family member');
    }
    return success({ message: 'Family member updated successfully', familyMember });
  }

  /**
   * Delete a family member
   * @param {string} id - Family member ID
   */
  async deleteFamilyMember(id) {
    const familyMember = await familyOwner.deleteById(id);
    if (!familyMember) {
      return notFound('Family member');
    }
    return success({ message: 'Family member deleted successfully' });
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
    if (familyData.members.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
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
        await familyOwner.deleteManyByUserIds(userIds, { session });
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
        await familyOwner.insertMany(familyMembersToCreate, { session });
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
