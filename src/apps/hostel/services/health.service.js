/**
 * Health Service
 * Contains all business logic for health operations.
 * 
 * @module services/health
 */

import { Health } from '../../../models/index.js';
import { InsuranceClaim } from '../../../models/index.js';
import { StudentProfile } from '../../../models/index.js';
import { BaseService, success, badRequest, notFound, withTransaction } from '../../../services/base/index.js';

class HealthService extends BaseService {
  constructor() {
    super(Health, 'Health');
  }

  /**
   * Get health record for a user
   * @param {string} userId - User ID
   */
  async getHealth(userId) {
    const health = await this.model.findOne({ userId }).populate('insurance.insuranceProvider');
    if (!health) {
      const newHealth = await this.model.create({ userId, bloodGroup: '', insurance: {} });
      return success({ message: 'Health created', health: newHealth }, 201);
    }
    return success({ message: 'Health fetched', health });
  }

  /**
   * Update health record for a user
   * @param {string} userId - User ID
   * @param {Object} data - Health data
   */
  async updateHealth(userId, { bloodGroup, insurance }) {
    const health = await this.model.findOneAndUpdate(
      { userId },
      { bloodGroup, insurance },
      { new: true }
    );
    return success({ message: 'Health updated', health });
  }

  /**
   * Bulk update student health records
   * @param {Array} studentsData - Array of student data with rollNumber and bloodGroup
   */
  async updateBulkStudentHealth(studentsData) {
    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return badRequest('Students data array is required and must not be empty');
    }

    return withTransaction(async (session) => {
      const rollNumbers = studentsData.map((student) => student.rollNumber.toUpperCase());

      const studentProfiles = await StudentProfile.find({
        rollNumber: { $in: rollNumbers }
      }).session(session);

      if (studentProfiles.length === 0) {
        return notFound('No students found with the provided roll numbers');
      }

      const studentProfileMap = {};
      const userIds = [];

      studentProfiles.forEach((profile) => {
        studentProfileMap[profile.rollNumber] = profile;
        userIds.push(profile.userId);
      });

      const results = { success: [], notFound: [] };

      // Build health data map
      const healthDataMap = {};
      studentsData.forEach((student) => {
        const rollNumber = student.rollNumber.toUpperCase();
        if (studentProfileMap[rollNumber]) {
          const userId = studentProfileMap[rollNumber].userId.toString();
          healthDataMap[userId] = {
            rollNumber,
            bloodGroup: student.bloodGroup
          };
        } else {
          results.notFound.push(rollNumber);
        }
      });

      // Get existing health records
      const existingHealthRecords = await this.model.find({
        userId: { $in: userIds }
      }).session(session);

      const healthRecordMap = {};
      existingHealthRecords.forEach((record) => {
        healthRecordMap[record.userId.toString()] = record;
      });

      // Prepare operations
      const healthRecordsToCreate = [];
      const bulkUpdateOps = [];

      userIds.forEach((userId) => {
        const userIdStr = userId.toString();
        const healthData = healthDataMap[userIdStr];
        if (!healthData) return;

        if (healthRecordMap[userIdStr]) {
          bulkUpdateOps.push({
            updateOne: {
              filter: { _id: healthRecordMap[userIdStr]._id },
              update: { $set: { bloodGroup: healthData.bloodGroup, updatedAt: Date.now() } }
            }
          });
        } else {
          healthRecordsToCreate.push({
            userId,
            bloodGroup: healthData.bloodGroup || '',
            insurance: { insuranceProvider: null, insuranceNumber: null }
          });
        }

        results.success.push({
          rollNumber: healthData.rollNumber,
          userId,
          bloodGroup: healthData.bloodGroup
        });
      });

      if (healthRecordsToCreate.length > 0) {
        await this.model.insertMany(healthRecordsToCreate, { session });
      }
      if (bulkUpdateOps.length > 0) {
        await this.model.bulkWrite(bulkUpdateOps, { session });
      }

      return success({
        message: 'Bulk health update completed',
        results: {
          totalProcessed: studentsData.length,
          successfulUpdates: results.success.length,
          notFoundCount: results.notFound.length,
          notFound: results.notFound
        },
        successDetails: results.success
      });
    });
  }

  /**
   * Create insurance claim
   * @param {Object} claimData - Claim data
   */
  async createInsuranceClaim(claimData) {
    const insuranceClaim = await InsuranceClaim.create(claimData);
    return success({ message: 'Insurance claim created', insuranceClaim }, 201);
  }

  /**
   * Get insurance claims for a user
   * @param {string} userId - User ID
   */
  async getInsuranceClaims(userId) {
    const insuranceClaims = await InsuranceClaim.find({ userId });
    return success({ message: 'Insurance claims fetched', insuranceClaims });
  }

  /**
   * Update insurance claim
   * @param {string} id - Claim ID
   * @param {Object} claimData - Claim data
   */
  async updateInsuranceClaim(id, claimData) {
    const insuranceClaim = await InsuranceClaim.findByIdAndUpdate(id, claimData, { new: true });
    return success({ message: 'Insurance claim updated', insuranceClaim });
  }

  /**
   * Delete insurance claim
   * @param {string} id - Claim ID
   */
  async deleteInsuranceClaim(id) {
    await InsuranceClaim.findByIdAndDelete(id);
    return { success: true, statusCode: 200, message: 'Insurance claim deleted' };
  }
}

export const healthService = new HealthService();
export default healthService;
